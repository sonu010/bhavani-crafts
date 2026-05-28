import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Playwright E2E — admin critical flows.
 *
 * Runs against a LOCAL Supabase stack + a local Next dev server, NEVER
 * production (E2E drives the real UI and mutates catalog data). See
 * `e2e/README.md` for the one-time bring-up:
 *
 *   1. supabase start                 # local Postgres + Auth (Docker)
 *   2. supabase db reset              # apply migrations to local
 *   3. pnpm e2e:seed                  # create the TOTP test admin
 *   4. pnpm playwright install chromium
 *   5. pnpm test:e2e
 *
 * Env: `e2e/.env.e2e` points NEXT_PUBLIC_SUPABASE_* at the local stack
 * (127.0.0.1:54321) + the local service-role key. The config loads it
 * so the dev server + the setup project share the same target.
 */

// Load e2e/.env.e2e into process.env if present (so `webServer` and the
// setup project both target the local stack).
const envPath = path.join(__dirname, "e2e", ".env.e2e");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const AUTH_STATE = "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  // E2E mutates shared catalog state → run serially, no parallelism
  // across files, to keep assertions deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1. Auth setup: logs in through the real UI (password + TOTP) and
    //    saves the storageState every authed test reuses.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2. Authed admin flows.
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
    },
    // 3. Anonymous flows (no stored auth) — guards, public redirects.
    {
      name: "anon",
      testMatch: /anon\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boot the Next dev server against the local stack for the run.
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      PREVIEW_TOKEN_SECRET: process.env.PREVIEW_TOKEN_SECRET ?? "e2e-preview-secret",
    },
  },
});
