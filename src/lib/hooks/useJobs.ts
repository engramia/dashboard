"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useJobs(status?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["jobs", status],
    queryFn: () => client!.listJobs(status),
    enabled: !!client,
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs;
      const hasRunning = jobs?.some((j) => j.status === "running" || j.status === "pending");
      return hasRunning ? 5_000 : false;
    },
  });
}

export function useCancelJob() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client!.cancelJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
