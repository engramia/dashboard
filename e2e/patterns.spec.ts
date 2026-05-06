import { test, expect } from "../fixtures/dashboard-auth";

test.describe("Patterns page", () => {
  test("renders search input and empty state", async ({
    authedPage: page,
  }) => {
    await page.goto("/patterns");

    await expect(
      page.getByRole("heading", { name: /patterns/i }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/search by task/i),
    ).toBeVisible();
    await expect(
      page.getByText(/enter a search query/i),
    ).toBeVisible();
  });

  test("search triggers recall and shows results or no-match", async ({
    authedPage: page,
  }) => {
    await page.goto("/patterns");

    const input = page.getByPlaceholder(/search by task/i);
    await input.fill("retry");
    // Wait for either results table or no-matches message
    await expect(
      page.getByText(/searching|no matches|task/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("table headers are correct when results exist", async ({
    authedPage: page,
  }) => {
    await page.goto("/patterns");
    await page.getByPlaceholder(/search by task/i).fill("test");

    // Wait for search to resolve
    await page.waitForTimeout(2000);

    // If results exist, verify table headers
    const table = page.locator("table");
    if (await table.isVisible()) {
      await expect(table.getByText("Task")).toBeVisible();
      await expect(table.getByText("Score")).toBeVisible();
      await expect(table.getByText("Reuse")).toBeVisible();
      await expect(table.getByText("Tier")).toBeVisible();
    }
  });
});

test.describe("Pattern detail — delete flow (admin)", () => {
  // The dashboard's Delete Pattern button on /patterns/detail is gated
  // on `hasPermission(role, "patterns:delete")` (page.tsx:129). The test
  // fixture authenticates as admin (default STUB_ROLE), so the button
  // is visible. The flow uses window.confirm() — we accept the dialog
  // and assert the DELETE request fires with the right key.
  const TEST_KEY = "patterns/abc123";

  function stubRecall(page: import("@playwright/test").Page) {
    return page.route("**/v1/recall*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          matches: [
            {
              pattern_key: TEST_KEY,
              similarity: 0.95,
              reuse_count: 3,
              tier: "duplicate",
              pattern: {
                task: "Retry HTTP request with exponential backoff",
                code: "for attempt in range(3):\n    ...",
                eval_score: 8.5,
              },
            },
          ],
        }),
      });
    });
  }

  test("admin clicks Delete, accepts confirm, DELETE /v1/patterns/{key} fires, navigates back to /patterns", async ({
    authedPage: page,
  }) => {
    await stubRecall(page);

    let deleteFiredFor: string | null = null;
    await page.route("**/v1/patterns/**", async (route) => {
      if (route.request().method() === "DELETE") {
        // URL ends with the encoded key; preserve raw form for assertion.
        deleteFiredFor = decodeURIComponent(
          new URL(route.request().url()).pathname.split("/v1/patterns/")[1] ?? "",
        );
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.continue();
      }
    });

    // Auto-accept the browser confirm dialog before we click Delete.
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(`/patterns/detail?key=${encodeURIComponent(TEST_KEY)}`);

    // Wait for the Task card to render so we know /v1/recall resolved.
    await expect(
      page.getByText("Retry HTTP request with exponential backoff"),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /delete pattern/i }).click();

    await expect.poll(() => deleteFiredFor, { timeout: 5_000 }).toBe(TEST_KEY);
    await page.waitForURL(/\/patterns(?:\/?$|\?)/, { timeout: 5_000 });
  });

  test("Delete Pattern button is hidden for non-admin roles", async ({
    authedPage: page,
  }) => {
    // The page renders the button conditionally on hasPermission(role,
    // "patterns:delete"). The stub at e2e/stubs/core-stub.mjs defaults
    // to STUB_ROLE=admin; here we override the /auth/me response to
    // simulate an editor session and assert the button is absent.
    await page.route("**/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "editor" }),
      });
    });
    await stubRecall(page);

    // The session role is read once at session-init time inside NextAuth's
    // JWT callback — overriding /auth/me at request time is a best-effort
    // hint. If the cached session still says admin, the button stays
    // visible; that's an upstream session-cache concern. Treat this test
    // as best-effort coverage of the conditional render path.
    await page.goto(`/patterns/detail?key=${encodeURIComponent(TEST_KEY)}`);

    await expect(
      page.getByText("Retry HTTP request with exponential backoff"),
    ).toBeVisible({ timeout: 10_000 });

    // Editor sees the page but not the destructive action.
    const deleteBtn = page.getByRole("button", { name: /delete pattern/i });
    // We accept either: button absent (preferred), or button still
    // visible because of session cache (in which case the browser
    // confirm() + server 403 are the actual gate). The assertion below
    // is the strict version; if session cache leaks we'll get a clear
    // "expected hidden, was visible" failure that documents the issue.
    await expect(deleteBtn).toBeHidden({ timeout: 5_000 });
  });
});
