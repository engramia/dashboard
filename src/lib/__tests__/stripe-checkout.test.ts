import { describe, it, expect } from "vitest";
import {
  DEFAULT_INTERVAL,
  PLAN_PRICING,
  isBillingInterval,
  parseIntervalParam,
} from "../stripe-checkout";

describe("isBillingInterval", () => {
  it.each(["monthly", "yearly"])("accepts canonical value: %s", (value) => {
    expect(isBillingInterval(value)).toBe(true);
  });

  it.each(["", "month", "year", "annual", "MONTHLY", null, undefined, 1, {}])(
    "rejects non-canonical value: %s",
    (value) => {
      expect(isBillingInterval(value)).toBe(false);
    },
  );
});

describe("parseIntervalParam", () => {
  it("normalises monthly aliases", () => {
    expect(parseIntervalParam("monthly")).toBe("monthly");
    expect(parseIntervalParam("month")).toBe("monthly");
  });

  it("normalises yearly aliases", () => {
    expect(parseIntervalParam("yearly")).toBe("yearly");
    expect(parseIntervalParam("year")).toBe("yearly");
    expect(parseIntervalParam("annual")).toBe("yearly");
    expect(parseIntervalParam("annually")).toBe("yearly");
  });

  it("falls back to DEFAULT_INTERVAL for null/empty/garbage", () => {
    expect(parseIntervalParam(null)).toBe(DEFAULT_INTERVAL);
    expect(parseIntervalParam("")).toBe(DEFAULT_INTERVAL);
    expect(parseIntervalParam("MONTHLY")).toBe(DEFAULT_INTERVAL); // case-sensitive
    expect(parseIntervalParam("nonsense")).toBe(DEFAULT_INTERVAL);
  });

  it("DEFAULT_INTERVAL is yearly (matches BillingPage default tab)", () => {
    expect(DEFAULT_INTERVAL).toBe("yearly");
  });
});

// Cross-repo invariant: these prices appear in three places —
//   - Core/engramia/billing/rate_cards.py (Stripe metadata)
//   - Dashboard/src/lib/stripe-checkout.ts (this file)
//   - Website/src/data/** + /pricing landing tables
// A diff in one without the others is a customer-visible bug. Snapshot
// them so an accidental edit fails this test loudly.
describe("PLAN_PRICING — cross-repo drift detector", () => {
  it("Pro plan: $19 mo / $14 mo billed annually", () => {
    expect(PLAN_PRICING.pro.monthly.display).toBe("$19");
    expect(PLAN_PRICING.pro.monthly.sub).toBe("/ mo");
    expect(PLAN_PRICING.pro.yearly.display).toBe("$14");
    expect(PLAN_PRICING.pro.yearly.sub).toBe("/ mo billed annually");
  });

  it("Team plan: $59 mo / $44 mo billed annually", () => {
    expect(PLAN_PRICING.team.monthly.display).toBe("$59");
    expect(PLAN_PRICING.team.monthly.sub).toBe("/ mo");
    expect(PLAN_PRICING.team.yearly.display).toBe("$44");
    expect(PLAN_PRICING.team.yearly.sub).toBe("/ mo billed annually");
  });

  it("Business plan: $199 mo / $149 mo billed annually", () => {
    expect(PLAN_PRICING.business.monthly.display).toBe("$199");
    expect(PLAN_PRICING.business.monthly.sub).toBe("/ mo");
    expect(PLAN_PRICING.business.yearly.display).toBe("$149");
    expect(PLAN_PRICING.business.yearly.sub).toBe("/ mo billed annually");
  });

  it("Pro, Team, Business are sold via self-service checkout", () => {
    // Developer (and the legacy "sandbox" alias) is free — no checkout.
    // Enterprise is sales-led. If a new self-service plan lands, this
    // test forces an explicit acknowledgement that the cross-repo
    // mirrors were updated.
    expect(Object.keys(PLAN_PRICING).sort()).toEqual(["business", "pro", "team"]);
  });
});
