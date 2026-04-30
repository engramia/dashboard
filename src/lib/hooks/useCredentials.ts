"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";
import type {
  CredentialCreateRequest,
  CredentialPublicView,
  CredentialUpdateRequest,
  FailoverChainUpdateRequest,
  RoleCostLimitsUpdateRequest,
  RoleModelsUpdateRequest,
} from "@/lib/types";

// ETag header value derived from a credential's ``updated_at``. The
// backend wraps the ISO-8601 timestamp in quotes per RFC 9110; the
// dashboard mirrors that wrapping so ``If-Match`` matches verbatim.
function etagFor(cred: CredentialPublicView): string {
  return `"${cred.updated_at ?? ""}"`;
}

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

// Phase 6.6 #2 — Business+ tier-gated mutations.
// Both pass the current credential's ``updated_at`` as the ``If-Match``
// ETag basis so concurrent admin edits surface as 412 instead of
// silent overwrites.

export function useUpdateRoleModels() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cred,
      req,
    }: {
      cred: CredentialPublicView;
      req: RoleModelsUpdateRequest;
    }) => client!.updateRoleModels(cred.id, req, etagFor(cred)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useUpdateFailoverChain() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cred,
      req,
    }: {
      cred: CredentialPublicView;
      req: FailoverChainUpdateRequest;
    }) => client!.updateFailoverChain(cred.id, req, etagFor(cred)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useUpdateRoleCostLimits() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cred,
      req,
    }: {
      cred: CredentialPublicView;
      req: RoleCostLimitsUpdateRequest;
    }) => client!.updateRoleCostLimits(cred.id, req, etagFor(cred)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
