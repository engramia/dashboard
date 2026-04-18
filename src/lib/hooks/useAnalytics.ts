"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useRollup(window: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["rollup", window],
    queryFn: () => client!.rollup(window),
    enabled: !!client,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useTriggerRollup() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (window: string) => client!.triggerRollup(window),
    onSuccess: (_, window) => {
      qc.invalidateQueries({ queryKey: ["rollup", window] });
    },
  });
}

export function useEvents(limit = 100, since?: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["events", limit, since],
    queryFn: () => client!.events(limit, since),
    enabled: !!client,
    staleTime: 60_000,
  });
}
