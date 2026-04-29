"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";
import type {
  CredentialCreateRequest,
  CredentialPublicView,
  CredentialUpdateRequest,
} from "@/lib/types";

const QK = ["credentials"] as const;

export function useCredentials() {
  const client = useApiClient();
  return useQuery<CredentialPublicView[]>({
    queryKey: QK,
    queryFn: () => client!.listCredentials(),
    enabled: !!client,
    staleTime: 60_000,
  });
}

export function useCreateCredential() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CredentialCreateRequest) =>
      client!.createCredential(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useUpdateCredential() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: CredentialUpdateRequest }) =>
      client!.updateCredential(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useRevokeCredential() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client!.revokeCredential(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useValidateCredential() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client!.validateCredential(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
