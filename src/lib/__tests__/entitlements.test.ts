import { describe, it, expect } from "vitest";
import {
  TIER_ORDER,
  FEATURE_MIN_TIER,
  tierAtLeast,
  hasFeature,
} from "../entitlements";

describe("tierAtLeast", () => {
  it("each tier satisfies its own threshold", () => {
    for (const tier of TIER_ORDER) {
      expect(tierAtLeast(tier, tier)).toBe(true);
    }
  });

  it("higher tiers satisfy lower thresholds", () => {
    expect(tierAtLeast("pro", "developer")).toBe(true);
    expect(tierAtLeast("team", "pro")).toBe(true);
    expect(tierAtLeast("business", "team")).toBe(true);
    expect(tierAtLeast("enterprise", "business")).toBe(true);
    expect(tierAtLeast("enterprise", "developer")).toBe(true);
  });

  it("lower tiers do NOT satisfy higher thresholds", () => {
    expect(tierAtLeast("developer", "pro")).toBe(false);
    expect(tierAtLeast("developer", "business")).toBe(false);
    expect(tierAtLeast("pro", "team")).toBe(false);
    expect(tierAtLeast("team", "business")).toBe(false);
    expect(tierAtLeast("business", "enterprise")).toBe(false);
  });

  it("`sandbox` is aliased to `developer`", () => {
    expect(tierAtLeast("sandbox", "developer")).toBe(true);
    expect(tierAtLeast("sandbox", "pro")).toBe(false);
  });

  it("unknown tier strings return false (deny-by-default)", () => {
    expect(tierAtLeast("", "developer")).toBe(false);
    expect(tierAtLeast("PRO", "pro")).toBe(false); // case-sensitive
    expect(tierAtLeast("legacy_free", "developer")).toBe(false);
    expect(tierAtLeast("ultimate", "developer")).toBe(false);
  });
});

describe("hasFeature — Phase 6.6 BYOK paywall", () => {
  it("byok.role_models requires business+", () => {
    expect(hasFeature("business", "byok.role_models")).toBe(true);
    expect(hasFeature("enterprise", "byok.role_models")).toBe(true);
    expect(hasFeature("team", "byok.role_models")).toBe(false);
    expect(hasFeature("pro", "byok.role_models")).toBe(false);
    expect(hasFeature("developer", "byok.role_models")).toBe(false);
    expect(hasFeature("sandbox", "byok.role_models")).toBe(false);
  });

  it("byok.failover_chain requires business+", () => {
    expect(hasFeature("business", "byok.failover_chain")).toBe(true);
    expect(hasFeature("enterprise", "byok.failover_chain")).toBe(true);
    expect(hasFeature("team", "byok.failover_chain")).toBe(false);
  });

  it("byok.role_cost_ceiling requires business+", () => {
    expect(hasFeature("business", "byok.role_cost_ceiling")).toBe(true);
    expect(hasFeature("team", "byok.role_cost_ceiling")).toBe(false);
  });

  it("unknown features deny by default", () => {
    expect(hasFeature("enterprise", "byok.someday_future_feature")).toBe(false);
    expect(hasFeature("enterprise", "")).toBe(false);
  });

  it("snapshot of FEATURE_MIN_TIER (drift detector vs Core entitlements.py)", () => {
    expect(FEATURE_MIN_TIER).toEqual({
      "byok.role_models": "business",
      "byok.failover_chain": "business",
      "byok.role_cost_ceiling": "business",
    });
  });
});

describe("TIER_ORDER snapshot", () => {
  it("locks the canonical tier ladder", () => {
    expect(TIER_ORDER).toEqual([
      "developer",
      "pro",
      "team",
      "business",
      "enterprise",
    ]);
  });
});
