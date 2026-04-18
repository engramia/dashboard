"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useRetention() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["retention"],
    queryFn: () => client!.getRetention(),
    enabled: !!client,
  });
}

export function useSetRetention() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number | null) => client!.setRetention(days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retention"] });
    },
  });
}

export function useApplyRetention() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (dryRun: boolean) => client!.applyRetention(dryRun),
  });
}

export function useDeleteProject() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (projectId: string) => client!.deleteProject(projectId),
  });
}
