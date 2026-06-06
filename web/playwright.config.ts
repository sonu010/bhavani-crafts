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
  // Generous per-test timeout: the webServer runs `next dev`, so the FIRST
  // hit to each route pays a cold Turbopack compile. The login setup alone
  // compiles /login → /admin → /auth/verify-2fa in one chain. 30s wasn't
  // enough on a cold server; 90s gives headroom without masking real hangs.
  timeout: 90_000,
  expect: { timeout: 10_000 },

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
    // 4. (opt-in via E2E_CHROME=1) Authed admin flows in the REAL Google
    //    Chrome installed on macOS (not the bundled Chromium).
    //    `channel: "chrome"` launches the system Chrome binary. Triggered
    //    by `pnpm test:e2e:chrome`. testMatch is empty unless the env var
    //    is set so the default `pnpm test:e2e` run doesn't run admin
    //    specs twice (once under chromium + once under chrome).
    {
      name: "admin-chrome",
      testMatch:
        process.env.E2E_CHROME === "1" ? /admin\/.*\.spec\.ts/ : /(?!.*)/, // never-match when disabled
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: AUTH_STATE },
    },
  ],

  // Boot a PRODUCTION build against the local stack for the run.
  //
  // We deliberately use `next build && next start`, not `next dev`:
  //   - `next dev` recompiles each route on first hit (Turbopack), so the
  //     login redirect chain (/login → /admin → /auth/verify-2fa) plus the
  //     proxy's auth network calls regularly blew past the test timeout and
  //     made the suite flaky.
  //   - A prod build is prebuilt → navigations + redirects resolve in ms,
  //     and it mirrors what real users/admins hit. It also sidesteps the
  //     dev-only cross-origin Server Action block entirely.
  // NEXT_PUBLIC_* are inlined at build time from `env` below (the LOCAL
  // stack), so the served app talks to local Supabase, never prod.
  webServer: {
    command: "pnpm build && pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      PREVIEW_TOKEN_SECRET: process.env.PREVIEW_TOKEN_SECRET ?? "e2e-preview-secret",
    },
  },
});
