import { test as base, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.DASHBOARD_TEST_EMAIL ?? "";
const TEST_PASSWORD = process.env.DASHBOARD_TEST_PASSWORD ?? "";

/**
 * Authenticate via the NextAuth Credentials provider. Requires a pre-seeded
 * cloud user in the running Core API; set DASHBOARD_TEST_EMAIL and
 * DASHBOARD_TEST_PASSWORD. After sign-in, NextAuth writes a signed session
 * cookie that all subsequent page requests reuse.
 */
async function authenticate(page: Page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      "DASHBOARD_TEST_EMAIL and DASHBOARD_TEST_PASSWORD must be set for E2E tests",
    );
  }
  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/overview/, { timeout: 15_000 });
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await authenticate(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
