import { defineConfig, devices } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3000";
// CI runs the suite against an in-process Core stub (e2e/stubs/core-stub.mjs).
// Local dev can still point at a real Core by leaving USE_CORE_STUB unset.
const USE_STUB = process.env.USE_CORE_STUB === "1" || process.env.CI === "true";
const STUB_PORT = 8000;
const STUB_URL = `http://localhost:${STUB_PORT}`;

// Two-server CI config: a Node Core stub on STUB_PORT plus the production
// Next.js build pointing NEXT_PUBLIC_API_URL at the stub. The explicit
// type annotation prevents TS from inferring a union-of-two-shapes for the
// `env` field, which would surface every key as `string | undefined` and
// fail the index-signature constraint of TestConfigWebServer.env.
const webServers: PlaywrightTestConfig["webServer"] = USE_STUB
  ? [
      {
        command: "node e2e/stubs/core-stub.mjs",
        url: `${STUB_URL}/health`,
        reuseExistingServer: !process.env.CI,
        env: {
          PORT: String(STUB_PORT),
          DASHBOARD_TEST_EMAIL: process.env.DASHBOARD_TEST_EMAIL ?? "ci-test@engramia.dev",
          DASHBOARD_TEST_PASSWORD: process.env.DASHBOARD_TEST_PASSWORD ?? "ci-test-password",
          STUB_ROLE: process.env.STUB_ROLE ?? "admin",
        } satisfies Record<string, string>,
        timeout: 30_000,
      },
      {
        command: "npm run start",
        url: DASHBOARD_URL,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_API_URL: STUB_URL,
          NEXTAUTH_SECRET: "ci-test-secret-not-used-in-prod",
          NEXTAUTH_URL: DASHBOARD_URL,
        } satisfies Record<string, string>,
        timeout: 120_000,
      },
    ]
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/stubs/**"],
  // Asserts DASHBOARD_TEST_EMAIL / DASHBOARD_TEST_PASSWORD are set BEFORE
  // any spec runs, so a missing env surfaces as one clear error instead
  // of 27 identical fixture errors per spec × N retries. See
  // playwright.global-setup.ts for the exact contract.
  globalSetup: require.resolve("./playwright.global-setup"),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  webServer: webServers,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: DASHBOARD_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
