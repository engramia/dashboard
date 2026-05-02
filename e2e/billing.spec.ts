import { test, expect } from "../fixtures/dashboard-auth";

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
