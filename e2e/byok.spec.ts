import { test, expect } from "../fixtures/dashboard-auth";
import type { Route } from "@playwright/test";

// Phase 6.6 BYOK page coverage. The page is 588+ lines of complex UI with
// zero existing E2E coverage. We mock the Core /v1/credentials/* routes via
// Playwright route handlers so this spec runs without provisioning real
// LLM keys or hitting a Core instance with BYOK enabled.

interface FakeCredential {
  id: string;
  provider: string;
  purpose: string;
  key_fingerprint: string;
  base_url: string | null;
  default_model: string | null;
  default_embed_model: string | null;
  role_models: Record<string, string>;
  failover_chain: string[];
  role_cost_limits: Record<string, number>;
  status: "active" | "revoked" | "invalid";
  last_used_at: string | null;
  last_validated_at: string | null;
  last_validation_error: string | null;
  created_at: string;
  updated_at: string | null;
}

function makeCred(overrides: Partial<FakeCredential> = {}): FakeCredential {
  const now = new Date().toISOString();
  return {
    id: "cred-1",
    provider: "openai",
    purpose: "llm",
    key_fingerprint: "sk-…AbCd",
    base_url: null,
    default_model: "gpt-4.1",
    default_embed_model: null,
    role_models: {},
    failover_chain: [],
    role_cost_limits: {},
    status: "active",
    last_used_at: null,
    last_validated_at: now,
    last_validation_error: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

class CredentialServer {
  store: FakeCredential[] = [];
  requestLog: { method: string; url: string; body?: unknown }[] = [];

  reset(initial: FakeCredential[] = []) {
    this.store = initial;
    this.requestLog = [];
  }

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = undefined;
    }
    this.requestLog.push({ method, url: path, body });

    // List
    if (method === "GET" && path === "/v1/credentials") {
      return route.fulfill(jsonResponse(this.store));
    }
    // Create
    if (method === "POST" && path === "/v1/credentials") {
      const b = body as { provider: string; api_key: string; default_model?: string };
      const created = makeCred({
        id: `cred-${this.store.length + 1}`,
        provider: b.provider,
        default_model: b.default_model ?? null,
      });
      this.store.push(created);
      return route.fulfill(jsonResponse(created, 201));
    }
    // Validate
    const validateMatch = path.match(/^\/v1\/credentials\/([^/]+)\/validate$/);
    if (method === "POST" && validateMatch) {
      const id = validateMatch[1];
      const cred = this.store.find((c) => c.id === id);
      if (!cred) {
        return route.fulfill(jsonResponse({ detail: "not found" }, 404));
      }
      cred.last_validated_at = new Date().toISOString();
      cred.last_validation_error = null;
      cred.updated_at = cred.last_validated_at;
      return route.fulfill(jsonResponse(cred));
    }
    // Revoke
    const revokeMatch = path.match(/^\/v1\/credentials\/([^/]+)$/);
    if (method === "DELETE" && revokeMatch) {
      const id = revokeMatch[1];
      const cred = this.store.find((c) => c.id === id);
      if (!cred) {
        return route.fulfill(jsonResponse({ detail: "not found" }, 404));
      }
      cred.status = "revoked";
      cred.updated_at = new Date().toISOString();
      return route.fulfill({ status: 204, body: "" });
    }

    return route.fallback();
  }
}

const server = new CredentialServer();

test.beforeEach(async ({ authedPage }) => {
  server.reset();
  // Mock Core /v1/credentials/* — works whether the dashboard talks to a
  // CI stub or a real backend, because the dashboard fetches client-side
  // and Playwright intercepts those calls in the browser.
  await authedPage.route("**/v1/credentials**", (route) => server.handle(route));
  // Billing status drives the currentTier prop on BusinessFeaturesPanel —
  // mock the developer free tier so paywalled UI is consistently hidden.
  await authedPage.route("**/v1/billing/status", (route) =>
    route.fulfill(
      jsonResponse({
        plan_tier: "developer",
        status: "active",
        billing_interval: "month",
        eval_runs_used: 0,
        eval_runs_limit: 100,
        patterns_used: 0,
        patterns_limit: 100,
        projects_used: 0,
        projects_limit: 1,
        period_end: null,
        overage_enabled: false,
        overage_budget_cap_cents: null,
        cancel_at_period_end: false,
      }),
    ),
  );
});

test.describe("BYOK / LLM Providers — empty state", () => {
  test("shows empty-state copy and an enabled Add-provider button", async ({
    authedPage,
  }) => {
    await authedPage.goto("/settings/llm-providers");

    await expect(
      authedPage.getByRole("heading", { name: /LLM Providers/i }),
    ).toBeVisible();
    await expect(
      authedPage.getByText(/No providers configured yet/i),
    ).toBeVisible();
    await expect(
      authedPage.getByRole("button", { name: /Add provider/i }),
    ).toBeEnabled();
    // Demo-mode banner surfaced when no active credential exists.
    await expect(authedPage.getByText(/Demo mode is active/i)).toBeVisible();
  });
});

test.describe("BYOK / LLM Providers — create flow", () => {
  test("create OpenAI credential POSTs the right shape and refreshes the list", async ({
    authedPage,
  }) => {
    await authedPage.goto("/settings/llm-providers");

    await authedPage
      .getByRole("button", { name: /Add provider/i })
      .click();
    const modal = authedPage.locator("dialog");
    await expect(
      modal.getByRole("heading", { name: /Add LLM provider/i }),
    ).toBeVisible();

    // OpenAI is the default selection — fill the API key. The labels in
    // the modal are plain <label> tags without `htmlFor`, so getByLabel
    // doesn't work — target the password input directly (only one in the
    // modal) and click "Validate & save".
    await modal.locator('input[type="password"]').fill("sk-test-1234567890");
    await modal.getByRole("button", { name: /Validate & save/i }).click();

    // Brief success flash, then auto-close + the new row.
    await expect(authedPage.getByText(/Saved\./i)).toBeVisible();
    await expect(authedPage.getByText(/OpenAI/i).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(authedPage.getByText(/Active/i).first()).toBeVisible();

    // The POST /v1/credentials request carried the correct body.
    const postCall = server.requestLog.find(
      (r) => r.method === "POST" && r.url === "/v1/credentials",
    );
    expect(postCall).toBeDefined();
    expect(postCall!.body).toMatchObject({
      provider: "openai",
      purpose: "llm",
      api_key: "sk-test-1234567890",
      base_url: null,
    });

    // Empty-state copy gone.
    await expect(
      authedPage.getByText(/No providers configured yet/i),
    ).toHaveCount(0);
  });

  test("Ollama selection requires base_url before submit", async ({
    authedPage,
  }) => {
    await authedPage.goto("/settings/llm-providers");
    await authedPage.getByRole("button", { name: /Add provider/i }).click();

    const modal = authedPage.locator("dialog");
    // Switch the provider <select> to Ollama via its value (the labels in
    // the modal aren't associated to controls via htmlFor, so getByLabel
    // is unreliable; the only <select> in the modal is the provider one).
    await modal.locator("select").selectOption("ollama");

    // Base URL input appears for Ollama (type=url is unique in the modal).
    await expect(modal.locator('input[type="url"]')).toBeVisible();

    // Try to submit without filling base_url — HTML5 required attribute
    // prevents the submit; the modal stays open and no POST is fired.
    await modal.locator('input[type="password"]').fill("anything");
    await modal.getByRole("button", { name: /Validate & save/i }).click();

    await expect(
      modal.getByRole("heading", { name: /Add LLM provider/i }),
    ).toBeVisible();
    expect(
      server.requestLog.some(
        (r) => r.method === "POST" && r.url === "/v1/credentials",
      ),
    ).toBe(false);
  });

  test("server-side error surfaces as a banner and does not close the modal", async ({
    authedPage,
  }) => {
    await authedPage.route("**/v1/credentials", async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill(
          jsonResponse(
            {
              detail: "OpenAI rejected the key (401).",
              error_code: "PROVIDER_AUTH_FAILED",
            },
            422,
          ),
        );
      }
      return route.fulfill(jsonResponse([]));
    });

    await authedPage.goto("/settings/llm-providers");
    await authedPage.getByRole("button", { name: /Add provider/i }).click();
    const modal = authedPage.locator("dialog");
    await modal.locator('input[type="password"]').fill("sk-bad");
    await modal.getByRole("button", { name: /Validate & save/i }).click();

    await expect(
      authedPage.getByText(/OpenAI rejected the key/i),
    ).toBeVisible();
    // Modal still open.
    await expect(
      authedPage.getByRole("heading", { name: /Add LLM provider/i }),
    ).toBeVisible();
  });
});

test.describe("BYOK / LLM Providers — validate + revoke", () => {
  test("Validate button POSTs to /validate and updates last_validated_at", async ({
    authedPage,
  }) => {
    server.reset([
      makeCred({ id: "cred-existing", last_validated_at: null }),
    ]);
    await authedPage.goto("/settings/llm-providers");
    await expect(authedPage.getByText(/OpenAI/i).first()).toBeVisible();

    await authedPage
      .getByRole("button", { name: /^Validate$/ })
      .first()
      .click();

    await expect.poll(() =>
      server.requestLog.some(
        (r) =>
          r.method === "POST" && r.url === "/v1/credentials/cred-existing/validate",
      ),
    ).toBe(true);

    // last_validated_at was null, now populated → "validated …" text appears.
    await expect(authedPage.getByText(/validated /i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Revoke flow: confirmation modal → DELETE → row marked Revoked", async ({
    authedPage,
  }) => {
    server.reset([makeCred({ id: "cred-to-revoke" })]);
    await authedPage.goto("/settings/llm-providers");

    await authedPage
      .getByRole("button", { name: /^Revoke$/ })
      .first()
      .click();

    // Confirmation modal — fingerprint shows in BOTH the row and the
    // modal, scope to the dialog to keep strict-mode locators happy.
    const modal = authedPage.locator("dialog");
    await expect(
      modal.getByRole("heading", { name: /Revoke credential/i }),
    ).toBeVisible();
    await expect(modal.getByText(/sk-…AbCd/)).toBeVisible();

    // Confirm — DELETE fires.
    await modal.getByRole("button", { name: /^Revoke$/ }).click();

    await expect.poll(() =>
      server.requestLog.some(
        (r) => r.method === "DELETE" && r.url === "/v1/credentials/cred-to-revoke",
      ),
    ).toBe(true);

    // Row updates to "Revoked" status; the action buttons disappear.
    await expect(authedPage.getByText(/Revoked/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Cancel on revoke modal does NOT fire DELETE", async ({ authedPage }) => {
    server.reset([makeCred({ id: "cred-keep" })]);
    await authedPage.goto("/settings/llm-providers");

    await authedPage
      .getByRole("button", { name: /^Revoke$/ })
      .first()
      .click();
    const modal = authedPage.locator("dialog");
    await expect(
      modal.getByRole("heading", { name: /Revoke credential/i }),
    ).toBeVisible();
    await modal.getByRole("button", { name: /^Cancel$/ }).click();

    // Modal closed, no DELETE fired.
    await expect(
      authedPage.getByRole("heading", { name: /Revoke credential/i }),
    ).toHaveCount(0);
    expect(
      server.requestLog.some((r) => r.method === "DELETE"),
    ).toBe(false);
  });
});

test.describe("BYOK / LLM Providers — backend disabled", () => {
  test("503 BYOK_NOT_ENABLED renders an inline notice and disables Add", async ({
    authedPage,
  }) => {
    await authedPage.route("**/v1/credentials", (route) =>
      route.fulfill(
        jsonResponse(
          {
            detail: "BYOK is not enabled on this Engramia instance.",
            error_code: "BYOK_NOT_ENABLED",
          },
          503,
        ),
      ),
    );

    await authedPage.goto("/settings/llm-providers");

    await expect(
      authedPage.getByText(/BYOK is not enabled on this Engramia instance/i),
    ).toBeVisible();
    await expect(
      authedPage.getByRole("button", { name: /Add provider/i }),
    ).toBeDisabled();
  });
});
