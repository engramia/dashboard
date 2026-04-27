"use client";

import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/session";
import type { DeletionRequestBody } from "@/lib/types";

export function useRequestAccountDeletion() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: DeletionRequestBody) => client!.requestAccountDeletion(body),
  });
}
