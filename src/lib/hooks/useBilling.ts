"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";

export function useBillingStatus() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => client!.getBillingStatus(),
    enabled: !!client,
    staleTime: 30_000,
  });
}

export function useCreateBillingPortal() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (returnUrl: string) => client!.createBillingPortal(returnUrl),
  });
}
