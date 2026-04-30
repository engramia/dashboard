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
  it("Pro plan: $29 mo / $23 mo billed annually", () => {
    expect(PLAN_PRICING.pro.monthly.display).toBe("$29");
    expect(PLAN_PRICING.pro.monthly.sub).toBe("/ mo");
    expect(PLAN_PRICING.pro.yearly.display).toBe("$23");
    expect(PLAN_PRICING.pro.yearly.sub).toBe("/ mo billed annually");
  });

  it("Team plan: $99 mo / $79 mo billed annually", () => {
    expect(PLAN_PRICING.team.monthly.display).toBe("$99");
    expect(PLAN_PRICING.team.monthly.sub).toBe("/ mo");
    expect(PLAN_PRICING.team.yearly.display).toBe("$79");
    expect(PLAN_PRICING.team.yearly.sub).toBe("/ mo billed annually");
  });

  it("only Pro and Team are sold via self-service checkout", () => {
    // Sandbox/Developer is free (no checkout). Business/Enterprise is
    // sales-led. If a new self-service plan lands, this test forces an
    // explicit acknowledgement that the cross-repo mirrors were updated.
    expect(Object.keys(PLAN_PRICING).sort()).toEqual(["pro", "team"]);
  });
});
