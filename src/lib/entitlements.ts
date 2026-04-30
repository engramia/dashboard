// Mirror of engramia/billing/entitlements.py.
// Updates here MUST stay in sync with the Core repo per the cross-repo
// invariants table in workspace CLAUDE.md.

export const TIER_ORDER = [
  "developer",
  "pro",
  "team",
  "business",
  "enterprise",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

const TIER_ALIAS: Record<string, Tier> = {
  sandbox: "developer", // legacy free-tier name
};

export const FEATURE_MIN_TIER: Record<string, Tier> = {
  "byok.role_models": "business",
  "byok.failover_chain": "business",
  "byok.role_cost_ceiling": "business", // follow-up #2b
};

function normalisedTier(tier: string): Tier | null {
  const aliased = TIER_ALIAS[tier] ?? tier;
  return (TIER_ORDER as readonly string[]).includes(aliased)
    ? (aliased as Tier)
    : null;
}

export function tierAtLeast(current: string, required: Tier): boolean {
  const cur = normalisedTier(current);
  if (cur === null) return false;
  return TIER_ORDER.indexOf(cur) >= TIER_ORDER.indexOf(required);
}

export function hasFeature(currentTier: string, feature: string): boolean {
  const min = FEATURE_MIN_TIER[feature];
  if (!min) return false;
  return tierAtLeast(currentTier, min);
}
