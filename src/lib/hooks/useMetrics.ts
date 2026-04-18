"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useMetrics() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["metrics"],
    queryFn: () => client!.metrics(),
    enabled: !!client,
    refetchInterval: 30_000,
  });
}
