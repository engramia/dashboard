import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("shows login form with email, password, and Google OAuth", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("shows verified banner when arriving with ?verified=true", async ({ page }) => {
    await page.goto("/login?verified=true");

    await expect(page.getByText(/email verified/i)).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@company.com").fill("bad@example.com");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid email or password/i),
    ).toBeVisible();
  });

  test("has link to register page", async ({ page }) => {
    await page.goto("/login");

    const link = page.getByRole("link", { name: /sign up/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/register");
  });

  test("shows 'verify email' prompt when Core returns 403 email_not_verified", async ({ page }) => {
    await page.route("**/auth/login", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error_code: "email_not_verified",
          detail: "Please verify your email first.",
        }),
      }),
    );

    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill("unverified@example.com");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/please verify your email before signing in/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /resend verification email/i }),
    ).toBeVisible();
  });
});

test.describe("Register page", () => {
  test("shows registration form", async ({ page }) => {
    await page.goto("/register");

    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(
      page.getByPlaceholder("Min. 8 characters"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).toBeVisible();
  });

  test("validates password mismatch", async ({ page }) => {
    await page.goto("/register");

    await page.getByPlaceholder("you@company.com").fill("test@example.com");
    await page.getByPlaceholder("Min. 8 characters").fill("password123");
    // Confirm password field
    const confirmField = page.locator('input[placeholder="••••••••"]');
    await confirmField.fill("different123");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/passwords/i)).toBeVisible();
  });

  test("has link to login page", async ({ page }) => {
    await page.goto("/register");

    const link = page.getByRole("link", { name: /sign in/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/login");
  });

  test("shows 'Check your email' pending stage after successful registration", async ({ page }) => {
    await page.route("**/auth/register", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          user_id: "u_test",
          email: "test@example.com",
          tenant_id: "t_test",
          api_key: "ek_test_xxx",
          verification_required: true,
          delivery_status: "sent",
        }),
      }),
    );

    await page.goto("/register");
    await page.getByPlaceholder("you@company.com").fill("test@example.com");
    await page.getByPlaceholder("Min. 8 characters").fill("password123");
    await page.locator('input[placeholder="••••••••"]').fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(
      page.getByRole("heading", { name: /check your email/i }),
    ).toBeVisible();
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /resend verification email/i }),
    ).toBeVisible();
  });

  test("shows delivery-failed warning when API returns delivery_status='failed'", async ({ page }) => {
    await page.route("**/auth/register", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          user_id: "u_test",
          email: "test@example.com",
          tenant_id: "t_test",
          api_key: "ek_test_xxx",
          verification_required: true,
          delivery_status: "failed",
        }),
      }),
    );

    await page.goto("/register");
    await page.getByPlaceholder("you@company.com").fill("test@example.com");
    await page.getByPlaceholder("Min. 8 characters").fill("password123");
    await page.locator('input[placeholder="••••••••"]').fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(
      page.getByText(/couldn.+t deliver the verification email/i),
    ).toBeVisible();
  });
});
