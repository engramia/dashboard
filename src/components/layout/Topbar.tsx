"use client";

import Link from "next/link";
import { useRole, useLogout } from "@/lib/session";
import { useHealth } from "@/lib/hooks/useHealth";
import { useBillingStatus } from "@/lib/hooks/useBilling";
import { hasPermission, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BookOpen, LogOut } from "lucide-react";

const HEALTH_TOOLTIP: Record<string, string> = {
  green: "Core API healthy — all components responding.",
  amber: "Core API degraded — some checks are slow or partially failing.",
  red: "Core API error — one or more components are down.",
  gray: "Core API status unknown — health probe not yet completed.",
};

const PLAN_LABELS: Record<string, string> = {
  sandbox: "Sandbox",
  developer: "Developer",
  pro: "Pro",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

function PlanBadge() {
  const { data: billing } = useBillingStatus();
  if (!billing) return null;
  return (
    <Link
      href="/billing"
      className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent/40"
      title="View billing & plan details"
    >
      <Badge color="blue">
        {PLAN_LABELS[billing.plan_tier] ?? billing.plan_tier} plan
      </Badge>
    </Link>
  );
}

export function Topbar() {
  const role = useRole();
  const logout = useLogout();
  const { data: health } = useHealth();
  const canSeeBilling = hasPermission(role, "billing:read");

  const healthColor =
    health?.status === "ok"
      ? "green"
      : health?.status === "degraded"
        ? "amber"
        : health?.status === "error"
          ? "red"
          : "gray";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-surface px-6">
      <div className="flex items-center gap-3">
        {health && (
          <>
            <span
              title={HEALTH_TOOLTIP[healthColor]}
              className={`inline-block h-2 w-2 cursor-help rounded-full ${
                healthColor === "green"
                  ? "bg-success"
                  : healthColor === "amber"
                    ? "bg-warning"
                    : healthColor === "red"
                      ? "bg-danger"
                      : "bg-text-secondary"
              }`}
            />
            <span
              className="cursor-help text-xs text-text-secondary"
              title="Core API version (server build)."
            >
              {health.version ?? ""}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <a
          href="https://docs.engramia.dev"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <BookOpen size={14} className="mr-1.5" />
          Docs
        </a>
        <Badge
          color="indigo"
          title={ROLE_DESCRIPTIONS[role]}
          className="cursor-help"
        >
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </Badge>
        {canSeeBilling && <PlanBadge />}
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut size={14} className="mr-1.5" />
          Logout
        </Button>
      </div>
    </header>
  );
}
