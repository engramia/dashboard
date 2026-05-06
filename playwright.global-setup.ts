/**
 * Playwright global setup — assert E2E preconditions BEFORE any test runs.
 *
 * Prevents the failure mode where 27 individual specs each throw the same
 * "DASHBOARD_TEST_EMAIL and DASHBOARD_TEST_PASSWORD must be set" error
 * (one per `authedPage` fixture invocation), drowning out the actionable
 * signal in 27 retries × 3 attempts of red. By failing once at startup
 * with a clear single error, the developer immediately knows what's
 * wrong instead of digging through retry logs.
 */
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const missing: string[] = [];

  // Hard requirement: the authedPage fixture in fixtures/dashboard-auth.ts
  // signs in via the Credentials provider with these env vars. CI passes
  // them via repo secrets; locally the developer must export them.
  if (!process.env.DASHBOARD_TEST_EMAIL) missing.push("DASHBOARD_TEST_EMAIL");
  if (!process.env.DASHBOARD_TEST_PASSWORD) missing.push("DASHBOARD_TEST_PASSWORD");

  if (missing.length > 0) {
    const cmdHint = [
      "DASHBOARD_TEST_EMAIL=ci-test@engramia.dev",
      "DASHBOARD_TEST_PASSWORD=ci-test-password",
      "USE_CORE_STUB=1",
      "CI=true",
      "npx playwright test",
    ].join(" \\\n  ");

    throw new Error(
      [
        "",
        "═".repeat(72),
        "Playwright preconditions not met:",
        ...missing.map((v) => `  - ${v} is not set`),
        "",
        "These env vars are required by the authedPage fixture",
        "(fixtures/dashboard-auth.ts). Without them, every spec that",
        "uses authedPage throws at fixture setup before exercising the",
        "UI — burning 9+ minutes of CI time on retries that test nothing.",
        "",
        "To run the full suite locally:",
        "",
        `  ${cmdHint}`,
        "",
        "If running against the in-process Core stub (USE_CORE_STUB=1),",
        "any non-empty values work — the stub accepts the canonical",
        "ci-test@engramia.dev / ci-test-password pair regardless.",
        "═".repeat(72),
      ].join("\n"),
    );
  }

  // For builds that are about to render the /register page during E2E,
  // surface a soft warning when the public-launch gate is on. The
  // register specs assert on form chrome that only renders when
  // NEXT_PUBLIC_REGISTRATION_ENABLED=true at *build* time. We can't fix
  // this from here (it's baked into the build), but we can surface it
  // so the developer doesn't blame the test.
  if (process.env.NEXT_PUBLIC_REGISTRATION_ENABLED !== "true") {
    // eslint-disable-next-line no-console
    console.warn(
      [
        "",
        "WARNING: NEXT_PUBLIC_REGISTRATION_ENABLED is not 'true' — the",
        "/register page will render the public-launch 'manual onboarding'",
        "panel instead of the form. auth.spec.ts Register-section tests",
        "will fail. Build with NEXT_PUBLIC_REGISTRATION_ENABLED=true",
        "before running E2E if you intend to exercise registration.",
        "",
      ].join("\n"),
    );
  }
}
