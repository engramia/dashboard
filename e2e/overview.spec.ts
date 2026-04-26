import { test, expect } from "../fixtures/dashboard-auth";

test.describe("Overview page", () => {
  test("renders KPI cards", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(
      page.getByRole("heading", { name: /overview/i }),
    ).toBeVisible();

    // KPI cards
    await expect(page.getByText("ROI Score")).toBeVisible();
    await expect(page.getByText("Patterns")).toBeVisible();
    await expect(page.getByText("Reuse Rate")).toBeVisible();
    await expect(page.getByText("Avg Eval")).toBeVisible();
  });

  test("renders system health section", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(page.getByText("System Health")).toBeVisible();
  });

  test("renders charts section", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(page.getByText(/roi score/i)).toBeVisible();
    await expect(page.getByText(/recall breakdown/i)).toBeVisible();
  });

  test("renders recent activity", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(page.getByText(/recent activity/i)).toBeVisible();
  });

  test("system health card exposes a recheck button", async ({
    authedPage: page,
  }) => {
    await page.goto("/overview");

    await expect(
      page.getByRole("button", { name: /recheck system health/i }),
    ).toBeVisible();
  });

  test("recheck button issues a fresh /v1/health/deep request", async ({
    authedPage: page,
  }) => {
    const healthRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/v1/health/deep")) {
        healthRequests.push(req.url());
      }
    });

    await page.goto("/overview");
    await expect(page.getByText("System Health")).toBeVisible();

    // Wait until the initial deep-health fetch has fired so we have a stable baseline.
    await expect.poll(() => healthRequests.length).toBeGreaterThanOrEqual(1);
    const baseline = healthRequests.length;

    await page
      .getByRole("button", { name: /recheck system health/i })
      .click();

    await expect
      .poll(() => healthRequests.length, { timeout: 5_000 })
      .toBeGreaterThan(baseline);
  });

  test("auto-refresh re-fetches analytics every 5 minutes", async ({
    authedPage: page,
  }) => {
    await page.clock.install();

    // /v1/analytics/events has no refetchInterval and a 60s staleTime, so any
    // additional request after the page settles must come from the page-level
    // 5-minute auto-refresh invalidation.
    const eventsRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/v1/analytics/events")) {
        eventsRequests.push(req.url());
      }
    });

    await page.goto("/overview");
    await expect(page.getByText("System Health")).toBeVisible();

    await expect.poll(() => eventsRequests.length).toBeGreaterThanOrEqual(1);
    const baseline = eventsRequests.length;

    // Advance just past the 5-minute interval so the useEffect tick fires.
    await page.clock.runFor(5 * 60 * 1000 + 1_000);

    await expect
      .poll(() => eventsRequests.length, { timeout: 5_000 })
      .toBeGreaterThan(baseline);
  });
});
