"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useHealth() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["health-deep"],
    queryFn: () => client!.healthDeep(),
    enabled: !!client,
    refetchInterval: 30_000,
  });
}
