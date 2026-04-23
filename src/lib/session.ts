"use client";

import { useSession, signOut } from "next-auth/react";
import { useMemo, useCallback } from "react";
import { EngramiaClient } from "./api";
import { getBackendUrl } from "./backend-url";

/**
 * Returns an EngramiaClient bound to the authenticated session's access token,
 * or null when the user is not authenticated. Authorization is enforced
 * server-side by the Core API; the role helpers below only affect UI visibility.
 */
export function useApiClient(): EngramiaClient | null {
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMemo(() => {
    if (!token) return null;
    return new EngramiaClient(getBackendUrl(), token);
  }, [token]);
}

export function useRole(): string {
  const { data: session } = useSession();
  return session?.role ?? "reader";
}

export function useIsAuthenticated(): boolean {
  const { data: session, status } = useSession();
  return status === "authenticated" && !!session?.accessToken;
}

export function useLogout(): () => void {
  return useCallback(() => {
    void signOut({ callbackUrl: "/login" });
  }, []);
}
