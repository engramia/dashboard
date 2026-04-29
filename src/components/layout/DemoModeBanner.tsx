"use client";

import Link from "next/link";
import { AlertCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useRole } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { useCredentials } from "@/lib/hooks/useCredentials";

const DISMISS_KEY = "engramia_demo_banner_dismissed_until";
const DISMISS_HOURS = 24;

/**
 * Persistent banner shown across the dashboard when the active tenant
 * has no LLM credential configured (BYOK demo mode).
 *
 * Hides itself in three cases:
 *   1. The current role lacks credentials:read (banner targets admins
 *      who can do something about it).
 *   2. The credentials API returns 503 BYOK_NOT_ENABLED — the operator,
 *      not the tenant, is responsible for that and surfaces it on the
 *      LLM Providers settings page directly.
 *   3. The user explicitly dismissed it; suppressed for DISMISS_HOURS.
 */
export function DemoModeBanner() {
  const role = useRole();
  const canSeeCredentials = hasPermission(role, "credentials:read");
  const credentials = useCredentials();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Date.parse(until) > Date.now()) setDismissed(true);
    } catch {
      /* localStorage unavailable — show banner */
    }
  }, []);

  if (!canSeeCredentials || dismissed) return null;
  if (!credentials.isFetched) return null;

  // BYOK_NOT_ENABLED → operator-side issue; banner not relevant here.
  const error = credentials.error;
  if (
    error instanceof ApiError &&
    (error.detail.includes("BYOK is not enabled") ||
      String(error.detail).includes("BYOK_NOT_ENABLED"))
  ) {
    return null;
  }

  const hasActive = (credentials.data ?? []).some((c) => c.status === "active");
  if (hasActive) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      const until = new Date(Date.now() + DISMISS_HOURS * 3_600_000);
      localStorage.setItem(DISMISS_KEY, until.toISOString());
    } catch {
      /* fail-safe — banner reappears on next mount */
    }
  };

  return (
    <div className="border-b border-yellow-700/40 bg-yellow-900/20 px-6 py-2">
      <div className="flex items-center gap-3">
        <AlertCircle size={16} className="shrink-0 text-yellow-400" />
        <span className="flex-1 text-sm text-yellow-100">
          <span className="font-semibold text-yellow-200">Demo mode:</span>{" "}
          eval responses are simulated. Add an LLM provider key to unlock real
          evaluations (50-call/month demo allowance applies until then).
        </span>
        <Link
          href="/settings/llm-providers"
          className="rounded-md bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-200 transition hover:bg-yellow-500/30"
        >
          Add key
        </Link>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss for 24 hours"
          className="text-yellow-400/70 transition hover:text-yellow-200"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
