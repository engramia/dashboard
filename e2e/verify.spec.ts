import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";

// Full state-machine coverage for /verify — the post-registration onboarding
// spine. The page reads ?token=, POSTs Core /auth/verify, then renders one of
// five status branches plus a localStorage-driven auto-login fallback. None
// of this had E2E coverage before this spec.

function jsonRoute(body: unknown, status = 200) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
}

test.describe("/verify — happy paths", () => {
  test("valid token shows 'Email verified' and redirects toward /login", async ({
    page,
  }) => {
    await page.route("**/auth/verify", jsonRoute({ verified: true }));

    await page.goto("/verify?token=abc123");

    await expect(page.getByRole("heading", { name: /Email verified/i })).toBeVisible();
    await expect(page.getByText(/Redirecting you to sign in/i)).toBeVisible();

    // No localStorage creds → 1500 ms fallback redirect to /login?verified=true.
    await page.waitForURL(/\/login\?verified=true/, { timeout: 5_000 });
  });

  test("idempotent re-verification → 'Already verified' branch", async ({
    page,
  }) => {
    await page.route(
      "**/auth/verify",
      jsonRoute({ verified: true, email_already_verified: true }),
    );

    await page.goto("/verify?token=already-used-but-verified");

    await expect(page.getByRole("heading", { name: /Already verified/i })).toBeVisible();
    // Same redirect contract as success path.
    await page.waitForURL(/\/login\?verified=true/, { timeout: 5_000 });
  });

  test("verifiedEmail propagates from sessionStorage to /login redirect", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("engramia_pending_email", "user@engramia.dev");
    });
    await page.route("**/auth/verify", jsonRoute({ verified: true }));

    await page.goto("/verify?token=abc");

    await page.waitForURL(/\/login\?verified=true&email=/, { timeout: 5_000 });
    expect(page.url()).toContain("email=user%40engramia.dev");
  });
});

test.describe("/verify — error branches", () => {
  test("missing token → 'Invalid verification link'", async ({ page }) => {
    // No token query param → component short-circuits before the fetch.
    await page.goto("/verify");
    await expect(
      page.getByRole("heading", { name: /Invalid verification link/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to sign in/i })).toBeVisible();
  });

  test("expired token → 'Link expired'", async ({ page }) => {
    await page.route(
      "**/auth/verify",
      jsonRoute(
        { detail: "This verification link has expired. Please request a new one." },
        400,
      ),
    );
    await page.goto("/verify?token=expired");
    await expect(page.getByRole("heading", { name: /Link expired/i })).toBeVisible();
    await expect(
      page.getByText(/more than 24 hours old/i),
    ).toBeVisible();
  });

  test("consumed token → 'Link already used'", async ({ page }) => {
    await page.route(
      "**/auth/verify",
      jsonRoute(
        { detail: "This verification link has already been used. Please request a new one if you're not logged in." },
        400,
      ),
    );
    await page.goto("/verify?token=consumed");
    await expect(page.getByRole("heading", { name: /Link already used/i })).toBeVisible();
  });

  test("unknown 4xx detail falls into 'Invalid verification link'", async ({
    page,
  }) => {
    await page.route(
      "**/auth/verify",
      jsonRoute({ detail: "Invalid or expired verification link." }, 400),
    );
    await page.goto("/verify?token=bogus");
    await expect(
      page.getByRole("heading", { name: /Invalid verification link/i }),
    ).toBeVisible();
  });

  test("malformed JSON body still renders 'Invalid' (does not 500)", async ({
    page,
  }) => {
    await page.route("**/auth/verify", (route) =>
      route.fulfill({
        status: 400,
        contentType: "text/plain",
        body: "<html>not json</html>",
      }),
    );
    await page.goto("/verify?token=plain");
    await expect(
      page.getByRole("heading", { name: /Invalid verification link/i }),
    ).toBeVisible();
  });

  test("server unreachable → 'Couldn't reach the server'", async ({ page }) => {
    await page.route("**/auth/verify", (route) => route.abort());
    await page.goto("/verify?token=any");
    await expect(
      page.getByRole("heading", { name: /Couldn.t reach the server/i }),
    ).toBeVisible();
    await expect(page.getByText(/try again in a moment/i)).toBeVisible();
  });

  test("5xx server error → 'Invalid verification link' (non-detail branch)", async ({
    page,
  }) => {
    await page.route(
      "**/auth/verify",
      jsonRoute({ detail: "internal error" }, 500),
    );
    await page.goto("/verify?token=boom");
    // 5xx with non-keyword detail falls through to "invalid".
    await expect(
      page.getByRole("heading", { name: /Invalid verification link/i }),
    ).toBeVisible();
  });
});

test.describe("/verify — auto-login fallback path", () => {
  test("stale localStorage creds (>24h) are wiped and we redirect to /login", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const stale = {
        email: "stale@engramia.dev",
        password: "doesnt-matter",
        // 25 hours old — older than PENDING_CREDS_MAX_AGE_MS (24h).
        created_at: Date.now() - 25 * 60 * 60 * 1000,
      };
      localStorage.setItem("engramia_pending_creds", JSON.stringify(stale));
    });
    await page.route("**/auth/verify", jsonRoute({ verified: true }));

    await page.goto("/verify?token=ok");
    await page.waitForURL(/\/login\?verified=true/, { timeout: 5_000 });

    // The page must wipe stale creds — never leave passwords sitting in
    // localStorage past the verify TTL.
    const remaining = await page.evaluate(() =>
      localStorage.getItem("engramia_pending_creds"),
    );
    expect(remaining).toBeNull();
  });

  test("malformed JSON in localStorage → silent fallback to /login", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("engramia_pending_creds", "{not valid json");
    });
    await page.route("**/auth/verify", jsonRoute({ verified: true }));

    await page.goto("/verify?token=ok");
    await page.waitForURL(/\/login\?verified=true/, { timeout: 5_000 });
  });

  test("missing email/password fields → fallback to /login", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "engramia_pending_creds",
        JSON.stringify({ created_at: Date.now() }),
      );
    });
    await page.route("**/auth/verify", jsonRoute({ verified: true }));

    await page.goto("/verify?token=ok");
    await page.waitForURL(/\/login\?verified=true/, { timeout: 5_000 });
  });
});
