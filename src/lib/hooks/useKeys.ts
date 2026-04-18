"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";
import type { KeyCreateRequest } from "@/lib/types";

export function useKeys() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["keys"],
    queryFn: () => client!.listKeys(),
    enabled: !!client,
  });
}

export function useCreateKey() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: KeyCreateRequest) => client!.createKey(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useRevokeKey() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client!.revokeKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useRotateKey() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client!.rotateKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}
