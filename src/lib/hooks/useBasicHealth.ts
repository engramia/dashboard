"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useBasicHealth() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["health-basic"],
    queryFn: () => client!.health(),
    enabled: !!client,
    refetchInterval: 60_000,
  });
}
