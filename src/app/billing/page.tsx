"use client";

import { useSession } from "next-auth/react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardTitle, CardValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  useBillingStatus,
  useCreateBillingPortal,
  useCreateCheckoutSession,
} from "@/lib/hooks/useBilling";
import { DEFAULT_INTERVAL, PLAN_PRICING } from "@/lib/stripe-checkout";
import type { BillingInterval, BillingPlan } from "@/lib/types";
import { AlertCircle, CreditCard, ExternalLink } from "lucide-react";
import { useState } from "react";

const PLAN_LABELS: Record<string, { name: string; price: string }> = {
  // "sandbox" is the legacy alias of "developer" — kept so any pre-6.6
  // row that escaped migration 024 still renders a label.
  sandbox: { name: "Developer", price: "Free" },
  developer: { name: "Developer", price: "Free" },
  pro: { name: "Pro", price: "$19/mo" },
  team: { name: "Team", price: "$59/mo" },
  business: { name: "Business", price: "$199/mo" },
  enterprise: { name: "Enterprise", price: "Custom" },
};

function isFreeTier(planTier: string): boolean {
  return planTier === "sandbox" || planTier === "developer";
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function formatLimit(n: number | null | undefined): string {
  if (n == null) return "unlimited";
  return n.toLocaleString();
}

function UsageBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number | null;
  label: string;
}) {
  const pct = limit == null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const overQuota = limit != null && used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-medium">
          {formatNumber(used)} / {formatLimit(limit)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden">
        <div
          className={`h-full rounded-full ${
            overQuota ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-accent"
          }`}
          style={{ width: `${limit == null ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const { data: status, isLoading, error, refetch } = useBillingStatus();
  const portalMutation = useCreateBillingPortal();
  const checkoutMutation = useCreateCheckoutSession();
  const [portalError, setPortalError] = useState<string>("");
  const [upgradeError, setUpgradeError] = useState<string>("");
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_INTERVAL);

  const handleManageSubscription = async () => {
    setPortalError("");
    try {
      const res = await portalMutation.mutateAsync(window.location.href);
      window.location.href = res.portal_url;
    } catch (e) {
      setPortalError(
        e instanceof Error ? e.message : "Couldn't open the Stripe Customer Portal.",
      );
    }
  };

  const handleUpgrade = async (planId: BillingPlan) => {
    setUpgradeError("");
    try {
      const origin = window.location.origin;
      const res = await checkoutMutation.mutateAsync({
        plan: planId,
        interval,
        success_url: `${origin}/billing?checkout=success`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
        ...(email ? { customer_email: email } : {}),
      });
      window.location.href = res.checkout_url;
    } catch (e) {
      setUpgradeError(
        e instanceof Error ? e.message : "Couldn't start the Stripe checkout.",
      );
    }
  };

  return (
    <Shell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your subscription and usage.
          </p>
        </div>

        {isLoading && (
          <Card>
            <p className="text-text-secondary">Loading plan status…</p>
          </Card>
        )}

        {error && (
          <Card>
            <p className="text-red-400 text-sm">
              Couldn&apos;t load billing status: {String((error as Error).message)}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-3 py-1.5 text-sm rounded bg-bg-elevated hover:bg-border transition"
            >
              Retry
            </button>
          </Card>
        )}

        {status && (
          <>
            {/* Current plan */}
            <Card>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard size={18} className="text-accent" />
                    <CardTitle>Current plan</CardTitle>
                  </div>
                  <CardValue>{PLAN_LABELS[status.plan_tier]?.name ?? status.plan_tier}</CardValue>
                  <div className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                    <span>{PLAN_LABELS[status.plan_tier]?.price}</span>
                    {!isFreeTier(status.plan_tier) && (
                      <>
                        <span>·</span>
                        <span>billed {status.billing_interval}ly</span>
                        <Badge color={status.cancel_at_period_end ? "amber" : undefined}>
                          {status.cancel_at_period_end ? "cancels at period end" : status.status}
                        </Badge>
                      </>
                    )}
                  </div>
                  {!isFreeTier(status.plan_tier) && status.period_end && !status.cancel_at_period_end && (
                    <p className="text-xs text-text-secondary mt-2">
                      Next billing cycle: {new Date(status.period_end).toLocaleDateString()}
                    </p>
                  )}
                  {!isFreeTier(status.plan_tier) && status.cancel_at_period_end && status.period_end && (
                    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm">
                      <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="text-amber-200 font-medium">Subscription cancelled</p>
                        <p className="text-text-secondary mt-0.5">
                          You keep {PLAN_LABELS[status.plan_tier]?.name ?? status.plan_tier} access until{" "}
                          <span className="text-text-primary">
                            {new Date(status.period_end).toLocaleDateString()}
                          </span>
                          . The subscription will not renew. Click <span className="font-medium">Manage subscription</span> to resume billing.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {(status.plan_tier === "pro" || status.plan_tier === "team" || status.plan_tier === "business") && (
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-bg-elevated hover:bg-border text-sm font-medium rounded-lg transition disabled:opacity-60"
                    >
                      {portalMutation.isPending ? "Opening…" : "Manage subscription"}
                      <ExternalLink size={14} />
                    </button>
                  )}
                </div>
              </div>
              {portalError && (
                <p className="mt-3 text-sm text-red-400">{portalError}</p>
              )}
            </Card>

            {/* Usage */}
            <Card>
              <CardTitle>Usage this period</CardTitle>
              <div className="mt-4 space-y-4">
                <UsageBar
                  used={status.eval_runs_used}
                  limit={status.eval_runs_limit}
                  label="Eval runs"
                />
                <UsageBar
                  used={status.patterns_used}
                  limit={status.patterns_limit}
                  label="Patterns stored"
                />
                <UsageBar
                  used={status.projects_used}
                  limit={status.projects_limit}
                  label="Projects"
                />
              </div>
            </Card>

            {/* Upgrade options — only for the free tier (Enterprise asks sales). */}
            {isFreeTier(status.plan_tier) && (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Upgrade</CardTitle>
                  <div
                    className="inline-flex rounded-lg bg-bg-elevated p-1"
                    role="tablist"
                    aria-label="Billing interval"
                  >
                    {(["yearly", "monthly"] as BillingInterval[]).map(value => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={interval === value}
                        onClick={() => setInterval(value)}
                        className={`px-3 py-1 text-xs rounded-md transition ${
                          interval === value
                            ? "bg-accent text-white"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {value === "yearly" ? "Yearly · save 25%" : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-text-secondary mt-2 mb-4">
                  Pick a paid plan to unlock higher limits and priority support.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <PlanUpgradeCard
                    planId="pro"
                    name="Pro"
                    interval={interval}
                    highlights={["50,000 eval runs/mo", "100,000 patterns", "10 projects", "Evolution + webhooks"]}
                    onUpgrade={handleUpgrade}
                    pending={checkoutMutation.isPending}
                  />
                  <PlanUpgradeCard
                    planId="team"
                    name="Team"
                    interval={interval}
                    highlights={["250,000 eval runs/mo", "1M patterns", "50 projects", "RBAC + audit + hosted MCP"]}
                    onUpgrade={handleUpgrade}
                    pending={checkoutMutation.isPending}
                    accent
                  />
                  <PlanUpgradeCard
                    planId="business"
                    name="Business"
                    interval={interval}
                    highlights={["1M eval runs/mo", "10M patterns", "250 projects", "SSO + cross-agent memory"]}
                    onUpgrade={handleUpgrade}
                    pending={checkoutMutation.isPending}
                  />
                </div>
                {upgradeError && (
                  <p className="mt-3 text-sm text-red-400">{upgradeError}</p>
                )}
                <p className="text-xs text-text-secondary mt-4">
                  Need higher limits or custom terms?{" "}
                  <a href="mailto:sales@engramia.dev" className="text-accent hover:underline">
                    Contact sales
                  </a>{" "}
                  about Enterprise.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

function PlanUpgradeCard({
  planId,
  name,
  interval,
  highlights,
  onUpgrade,
  pending,
  accent,
}: {
  planId: BillingPlan;
  name: string;
  interval: BillingInterval;
  highlights: string[];
  onUpgrade: (planId: BillingPlan) => void;
  pending: boolean;
  accent?: boolean;
}) {
  const pricing = PLAN_PRICING[planId][interval];
  return (
    <div
      className={`p-5 rounded-xl border ${
        accent ? "border-accent bg-accent/10" : "border-border bg-bg-surface"
      }`}
    >
      <div className="text-lg font-bold text-text-primary">{name}</div>
      <div className="mt-1 mb-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-text-primary">{pricing.display}</span>
        <span className="text-sm text-text-secondary">{pricing.sub}</span>
      </div>
      <ul className="space-y-1 mb-4 text-sm">
        {highlights.map(h => (
          <li key={h} className="flex gap-2 text-text-secondary">
            <span className="text-green-400">✓</span>
            {h}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onUpgrade(planId)}
        disabled={pending}
        className={`w-full py-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
          accent
            ? "bg-accent hover:bg-accent/80 text-white"
            : "bg-bg-elevated hover:bg-border text-text-primary"
        }`}
      >
        {pending ? "Opening checkout…" : `Upgrade to ${name}`}
      </button>
    </div>
  );
}
