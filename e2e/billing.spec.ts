import { test as anonymous, expect as anonymousExpect } from "@playwright/test";
import { test, expect } from "../fixtures/dashboard-auth";

anonymous.describe("Billing page (unauthenticated)", () => {
  anonymous("redirects to /login when no session is present", async ({ page }) => {
    // Shell.tsx is the auth-gate: useEffect → router.push("/login") on
    // status === "unauthenticated", and `return null` blocks any render
    // (and therefore any /v1/billing/status fetch) until the session
    // resolves. This test guards against a future Shell refactor that
    // forgets the gate — the BillingPage itself does not check auth.
    await page.goto("/billing");
    await page.waitForURL(/\/login(?:\?|$)/, { timeout: 10_000 });
    anonymousExpect(page.url()).toMatch(/\/login(?:\?|$)/);
  });
});

test.describe("Billing page", () => {
  test("upgrade card defaults to yearly pricing", async ({ authedPage: page }) => {
    await page.goto("/billing");

    // Free-tier accounts (developer / legacy sandbox) see the upgrade panel;
    // the test fixture logs in as a developer-tier user.
    await expect(page.getByRole("heading", { name: "Upgrade", exact: true })).toBeVisible();

    // Yearly tab is selected by default and the Pro card shows the discounted
    // headline price ($14, billed annually).
    await expect(
      page.getByRole("tab", { name: /yearly/i, selected: true }),
    ).toBeVisible();
    await expect(page.getByText("$14", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/billed annually/i).first()).toBeVisible();
  });

  test("monthly toggle swaps prices in upgrade cards", async ({
    authedPage: page,
  }) => {
    await page.goto("/billing");
    await expect(
      page.getByRole("heading", { name: "Upgrade", exact: true }),
    ).toBeVisible();

    await page.getByRole("tab", { name: /^monthly$/i }).click();

    await expect(
      page.getByRole("tab", { name: /^monthly$/i, selected: true }),
    ).toBeVisible();
    // Pro monthly = $19
    await expect(page.getByText("$19", { exact: true }).first()).toBeVisible();
    // Team monthly = $59
    await expect(page.getByText("$59", { exact: true }).first()).toBeVisible();
    // Business monthly = $199
    await expect(page.getByText("$199", { exact: true }).first()).toBeVisible();
  });

  test(
    "upgrade click POSTs {plan, interval} to /v1/billing/checkout",
    async ({ authedPage: page }) => {
      // Intercept the Core API call so the test does not actually hit Stripe
      // and so we can assert on the request body shape.
      let captured: { plan?: string; interval?: string; customer_email?: string } = {};
      await page.route("**/v1/billing/checkout", async (route) => {
        captured = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ checkout_url: "about:blank#stub" }),
        });
      });

      await page.goto("/billing");
      await expect(
        page.getByRole("heading", { name: "Upgrade", exact: true }),
      ).toBeVisible();

      // Default state is yearly — click "Upgrade to Pro".
      await page
        .getByRole("button", { name: /upgrade to pro/i })
        .click();

      await expect.poll(() => captured.plan).toBe("pro");
      expect(captured.interval).toBe("yearly");
    },
  );
});

test.describe("Billing page — current plan rendering (paid tiers)", () => {
  // The previous tests cover the free-tier (developer) state where the
  // upgrade panel is shown. These three tests cover the paid-state UI:
  // the "Current plan" card with renewal date, the cancel-at-period-end
  // banner, and the past_due warning. Each variant is driven by mocking
  // /v1/billing/status with the corresponding shape — exactly what Core
  // would return in production.
  function stubBillingStatus(
    page: import("@playwright/test").Page,
    overrides: Record<string, unknown>,
  ) {
    const base = {
      plan_tier: "developer",
      status: "active",
      billing_interval: "month",
      eval_runs_used: 0,
      eval_runs_limit: 5000,
      patterns_used: 0,
      patterns_limit: 10000,
      projects_used: 0,
      projects_limit: 2,
      period_end: null,
      overage_enabled: false,
      overage_budget_cap_cents: null,
      cancel_at_period_end: false,
    };
    return page.route("**/v1/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...base, ...overrides }),
      });
    });
  }

  test("pro/yearly active — Current plan card shows name, billed yearly, next billing date, no upgrade panel", async ({
    authedPage: page,
  }) => {
    const periodEnd = "2027-05-05T00:00:00Z"; // Far enough in the future
    await stubBillingStatus(page, {
      plan_tier: "pro",
      status: "active",
      billing_interval: "year",
      eval_runs_used: 12_345,
      eval_runs_limit: 50_000,
      patterns_used: 4_321,
      patterns_limit: 100_000,
      projects_used: 3,
      projects_limit: 10,
      period_end: periodEnd,
    });

    await page.goto("/billing");

    // Current plan card is the page's first major card on paid tiers.
    await expect(
      page.getByRole("heading", { name: /current plan/i }),
    ).toBeVisible();
    // Plan name from PLAN_LABELS.pro.
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible();
    // Billing cadence + status badge.
    await expect(page.getByText(/billed yearly/i)).toBeVisible();
    await expect(page.getByText(/active/i).first()).toBeVisible();
    // Next renewal date is rendered (locale-formatted; just look for 2027).
    await expect(page.getByText(/2027/)).toBeVisible();
    // Upgrade panel is HIDDEN on paid tiers.
    await expect(
      page.getByRole("heading", { name: "Upgrade", exact: true }),
    ).toBeHidden();
    // Manage subscription button is shown for paid tiers.
    await expect(
      page.getByRole("button", { name: /manage subscription/i }),
    ).toBeVisible();
  });

  test("pro/cancel_at_period_end=true — shows cancellation banner and period-end date", async ({
    authedPage: page,
  }) => {
    const periodEnd = "2027-06-30T00:00:00Z";
    await stubBillingStatus(page, {
      plan_tier: "pro",
      status: "active",
      billing_interval: "year",
      period_end: periodEnd,
      cancel_at_period_end: true,
    });

    await page.goto("/billing");

    await expect(
      page.getByRole("heading", { name: /current plan/i }),
    ).toBeVisible();
    // Cancellation banner copy from billing/page.tsx:176-184.
    await expect(page.getByText(/subscription cancelled/i)).toBeVisible();
    await expect(page.getByText(/2027/)).toBeVisible();
    // Status badge text changes from "active" → "cancels at period end".
    await expect(
      page.getByText(/cancels at period end/i),
    ).toBeVisible();
  });

  test("past_due status — Current plan card surfaces the past_due badge", async ({
    authedPage: page,
  }) => {
    await stubBillingStatus(page, {
      plan_tier: "pro",
      status: "past_due",
      billing_interval: "month",
      period_end: "2027-05-05T00:00:00Z",
    });

    await page.goto("/billing");

    await expect(
      page.getByRole("heading", { name: /current plan/i }),
    ).toBeVisible();
    // Status badge shows "past_due" verbatim per billing/page.tsx:162.
    await expect(page.getByText("past_due", { exact: true })).toBeVisible();
  });
});
