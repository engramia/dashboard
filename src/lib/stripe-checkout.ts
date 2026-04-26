import type { BillingPlan, BillingInterval } from "./types";

export const DEFAULT_INTERVAL: BillingInterval = "yearly";

export const PLAN_PRICING: Record<
  BillingPlan,
  { monthly: { display: string; sub: string }; yearly: { display: string; sub: string } }
> = {
  pro: {
    monthly: { display: "$29", sub: "/ mo" },
    yearly: { display: "$23", sub: "/ mo billed annually" },
  },
  team: {
    monthly: { display: "$99", sub: "/ mo" },
    yearly: { display: "$79", sub: "/ mo billed annually" },
  },
};

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

export function parseIntervalParam(raw: string | null): BillingInterval {
  if (raw === "monthly" || raw === "month") return "monthly";
  if (raw === "yearly" || raw === "year" || raw === "annual" || raw === "annually") {
    return "yearly";
  }
  return DEFAULT_INTERVAL;
}
