import { test, expect } from "../fixtures/dashboard-auth";
import type { Page } from "@playwright/test";

const TEST_EMAIL = process.env.DASHBOARD_TEST_EMAIL ?? "";

// All four specs intercept the Core API so the test account is never actually
// deleted. The endpoints are documented in
// engramia/api/cloud_auth.py — POST /auth/me/deletion-request and DELETE /auth/me.

async function mockDeletionRequest(
  page: Page,
  response: { status: number; body: unknown },
) {
  await page.route("**/auth/me/deletion-request", async (route) => {
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    });
  });
}

async function mockDeletionConfirm(
  page: Page,
  response: { status: number; body: unknown },
) {
  await page.route("**/auth/me?token=*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    });
  });
}

test.describe("Account deletion — request flow", () => {
  test("happy path: open modal, type email, send confirmation", async ({
    authedPage: page,
  }) => {
    let captured: { reason?: string } = {};
    await page.route("**/auth/me/deletion-request", async (route) => {
      captured = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          delivery_status: "sent",
        }),
      });
    });

    await page.goto("/settings/account");
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

    await page.getByTestId("open-delete-modal").click();
    await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();

    // Submit is disabled until the email matches.
    const submit = page.getByTestId("submit-deletion-request");
    await expect(submit).toBeDisabled();

    await page.getByTestId("confirm-email-input").fill(TEST_EMAIL);
    await page.getByTestId("reason-input").fill("just testing");
    await expect(submit).toBeEnabled();

    await submit.click();

    await expect(page.getByTestId("deletion-pending-banner")).toBeVisible();
    await expect(
      page.getByText(/Confirmation email sent/i),
    ).toBeVisible();
    expect(captured.reason).toBe("just testing");
  });

  test("typing wrong email keeps submit disabled", async ({
    authedPage: page,
  }) => {
    await page.goto("/settings/account");
    await page.getByTestId("open-delete-modal").click();
    await page
      .getByTestId("confirm-email-input")
      .fill("typo@example.com");
    await expect(page.getByTestId("submit-deletion-request")).toBeDisabled();
  });

  test("backend 409 deletion_already_pending surfaces a friendly error", async ({
    authedPage: page,
  }) => {
    await mockDeletionRequest(page, {
      status: 409,
      body: {
        detail: {
          error_code: "deletion_already_pending",
          detail: "A deletion confirmation email was already sent.",
        },
      },
    });

    await page.goto("/settings/account");
    await page.getByTestId("open-delete-modal").click();
    await page.getByTestId("confirm-email-input").fill(TEST_EMAIL);
    await page.getByTestId("submit-deletion-request").click();

    await expect(page.getByTestId("delete-error")).toContainText(
      /already.*sent/i,
    );
  });

  test("delivery_status='failed' surfaces SMTP outage banner", async ({
    authedPage: page,
  }) => {
    await mockDeletionRequest(page, {
      status: 202,
      body: {
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        delivery_status: "failed",
      },
    });

    await page.goto("/settings/account");
    await page.getByTestId("open-delete-modal").click();
    await page.getByTestId("confirm-email-input").fill(TEST_EMAIL);
    await page.getByTestId("submit-deletion-request").click();

    await expect(page.getByTestId("deletion-pending-banner")).toContainText(
      /SMTP/,
    );
  });
});

test.describe("Account deletion — confirm-delete page", () => {
  test("happy path: clicks final delete, sees deleted state", async ({
    page,
  }) => {
    await mockDeletionConfirm(page, {
      status: 200,
      body: {
        deleted: true,
        tenant_id: "test-tenant",
        patterns_deleted: 12,
        keys_revoked: 1,
        stripe_subscription_cancelled: true,
      },
    });

    await page.goto("/account/confirm-delete?token=" + "a".repeat(32));
    await expect(
      page.getByRole("heading", { name: /Confirm account deletion/i }),
    ).toBeVisible();

    await page.getByTestId("final-delete-button").click();

    await expect(
      page.getByRole("heading", { name: /Account deleted/i }),
    ).toBeVisible();
    await expect(page.getByText(/Patterns deleted: 12/)).toBeVisible();
    await expect(page.getByText(/Subscription cancelled: yes/)).toBeVisible();
  });

  test("missing token shows invalid state immediately", async ({ page }) => {
    await page.goto("/account/confirm-delete");
    await expect(
      page.getByRole("heading", { name: /Invalid deletion link/i }),
    ).toBeVisible();
  });

  test("expired token shows expiry copy", async ({ page }) => {
    await mockDeletionConfirm(page, {
      status: 400,
      body: { detail: "This deletion link has expired. Please request a new one." },
    });

    await page.goto("/account/confirm-delete?token=" + "b".repeat(32));
    await page.getByTestId("final-delete-button").click();

    await expect(
      page.getByRole("heading", { name: /Link expired/i }),
    ).toBeVisible();
  });

  test("consumed token shows already-used copy (HTTP 410)", async ({
    page,
  }) => {
    await mockDeletionConfirm(page, {
      status: 410,
      body: { detail: "This deletion link has already been used." },
    });

    await page.goto("/account/confirm-delete?token=" + "c".repeat(32));
    await page.getByTestId("final-delete-button").click();

    await expect(
      page.getByRole("heading", { name: /Already used/i }),
    ).toBeVisible();
  });
});
