import { test, expect } from "../fixtures/dashboard-auth";

test.describe("API Keys page", () => {
  test("renders key list and create button", async ({ authedPage: page }) => {
    await page.goto("/keys");

    await expect(
      page.getByRole("heading", { name: /api keys/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create key/i }),
    ).toBeVisible();
  });

  test("shows key table with correct columns", async ({
    authedPage: page,
  }) => {
    await page.goto("/keys");

    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.getByText("Name")).toBeVisible();
    await expect(table.getByText("Prefix")).toBeVisible();
    await expect(table.getByText("Role")).toBeVisible();
  });

  test("opens create key modal", async ({ authedPage: page }) => {
    await page.goto("/keys");

    await page.getByRole("button", { name: /create key/i }).click();
    await expect(page.getByText(/create api key/i)).toBeVisible();
    await expect(
      page.getByPlaceholder(/e\.g\. production/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^create$/i })).toBeVisible();
  });

  test("cancel closes modal", async ({ authedPage: page }) => {
    await page.goto("/keys");

    await page.getByRole("button", { name: /create key/i }).click();
    await expect(page.getByText(/create api key/i)).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText(/create api key/i)).toBeHidden();
  });
});

test.describe("API Keys — one-time secret display (security-critical)", () => {
  // POST /v1/keys returns the plaintext key exactly once. The dashboard
  // shows it in the "Copy your API key now" modal; closing the modal
  // drops the value from React state and it must not appear in any
  // subsequent rendered surface (table row, copy buffer cleared, etc.).
  // This is the security-critical UX invariant the audit flagged.
  const FRESH_KEY = "ek_test_12345abcdef67890_super_secret_token";
  const KEY_PREFIX = "ek_test_1234"; // What the table row shows

  test("creating a key shows the plaintext secret once and the modal close hides it permanently", async ({
    authedPage: page,
  }) => {
    let createBody: { name?: string; role?: string } | null = null;
    await page.route("**/v1/keys", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        createBody = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "key-uuid-1",
            key: FRESH_KEY,
            name: createBody?.name ?? "Test",
            role: createBody?.role ?? "editor",
            prefix: KEY_PREFIX,
            created_at: "2026-05-05T00:00:00Z",
          }),
        });
      } else {
        // GET /v1/keys list — return the just-created key (with prefix
        // only, no plaintext) so the table row appears after modal close.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            keys: [
              {
                id: "key-uuid-1",
                name: createBody?.name ?? "Test",
                role: createBody?.role ?? "editor",
                prefix: KEY_PREFIX,
                created_at: "2026-05-05T00:00:00Z",
                last_used_at: null,
                status: "active",
              },
            ],
          }),
        });
      }
    });

    // Stub clipboard write so the copy button doesn't fail in headless mode.
    await page.addInitScript(() => {
      (window as unknown as { __copied?: string }).__copied = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (window as unknown as { __copied?: string }).__copied = text;
          },
          readText: async () => "",
        },
        configurable: true,
      });
    });

    await page.goto("/keys");
    await page.getByRole("button", { name: /create key/i }).click();
    await page.getByPlaceholder(/e\.g\. production/i).fill("Test Key");
    await page.getByRole("button", { name: /^create$/i }).click();

    // The one-time-display modal opens with the plaintext secret.
    await expect(
      page.getByRole("heading", { name: /copy your api key now/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(FRESH_KEY, { exact: false })).toBeVisible();

    // Copy-to-clipboard button writes the plaintext to navigator.clipboard.
    // Match by Copy icon's accessible name (title="Copy to clipboard").
    await page.getByRole("button", { name: /copy to clipboard/i }).click();
    const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
    expect(copied).toBe(FRESH_KEY);

    // Close the modal via "I've saved it".
    await page.getByRole("button", { name: /i've saved it/i }).click();

    // Modal gone.
    await expect(
      page.getByRole("heading", { name: /copy your api key now/i }),
    ).toBeHidden({ timeout: 5_000 });

    // SECURITY INVARIANT — plaintext key MUST NOT remain in the DOM
    // after the modal closes. Only the prefix may appear (in the row).
    const html = await page.content();
    expect(
      html,
      "Plaintext API key remained in the DOM after the one-time display modal closed",
    ).not.toContain(FRESH_KEY);
    // Prefix shown in the table row (positive assertion that the row
    // rendered at all — guards against accidentally also dropping the
    // prefix display).
    expect(html).toContain(KEY_PREFIX);
  });
});
