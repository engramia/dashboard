import { test, expect } from "../fixtures/dashboard-auth";

test.describe("Overview page", () => {
  test("renders KPI cards", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(
      page.getByRole("heading", { name: /overview/i }),
    ).toBeVisible();

    // KPI cards — match by heading role so we don't collide with the
    // sidebar "Patterns" link or the "ROI Score (Weekly)" chart title.
    await expect(
      page.getByRole("heading", { name: "ROI Score", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Patterns", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Reuse Rate", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Avg Eval", exact: true }),
    ).toBeVisible();
  });

  test("renders system health section", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(page.getByText("System Health")).toBeVisible();
  });

  test("renders charts section", async ({ authedPage: page }) => {
    await page.goto("/overview");

    await expect(
      page.getByRole("heading", { name: /roi score \(weekly\)/i }),
    ).toBeVisible();
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

  test("registers a 5-minute auto-refresh interval", async ({
    authedPage: page,
  }) => {
    // Spy on window.setInterval before any page script runs. This lets us
    // assert that the overview useEffect actually schedules a 5-minute timer
    // without simulating clock advance — page.clock + TanStack Query +
    // NextAuth interactions made the time-based variant flaky.
    await page.addInitScript(() => {
      const orig = window.setInterval.bind(window);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__intervalDelays = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.setInterval = function (this: unknown, handler: any, delay?: number, ...args: unknown[]) {
        if (typeof delay === "number") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__intervalDelays.push(delay);
        }
        return orig(handler, delay, ...args);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });

    await page.goto("/overview");
    await expect(page.getByText("System Health")).toBeVisible();

    const delays = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__intervalDelays as number[],
    );
    expect(delays).toContain(5 * 60 * 1000);
  });
});
