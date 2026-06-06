/**
 * Vitest global setup.
 *
 * SAFETY (read this before changing): the data-layer integration tests
 * INSERT and DELETE rows (makeTestProduct, purgeZzzFixtures, the global
 * afterAll below). They must run against the LOCAL Supabase test stack —
 * NEVER the live production project. A bug in a fixture slug or a stray
 * DELETE could otherwise damage real catalog data.
 *
 * Env resolution (first match wins):
 *   1. web/.env.test     — the local test stack (created by
 *                          `pnpm test:setup` / scripts/write-test-env.mjs)
 *   2. web/.env.local    — dev secrets (POINTS AT LIVE PROD) — only used
 *                          if .env.test is absent, AND then the local-URL
 *                          guard below refuses to proceed unless the
 *                          explicit escape hatch ALLOW_NONLOCAL_TEST_DB=1
 *                          is set.
 *
 * To run the suites: `pnpm test:setup` once (boots + resets the local
 * stack and writes .env.test), then `pnpm test`.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll } from "vitest";

function loadEnvFile(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return true;
}

const testEnv = path.join(__dirname, ".env.test");
const localEnv = path.join(__dirname, ".env.local");

const loadedTestEnv = loadEnvFile(testEnv);
if (!loadedTestEnv) {
  // Fall back to .env.local (prod) only so the URL guard below can produce
  // a precise, actionable error instead of a confusing "missing env" one.
  loadEnvFile(localEnv);
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
for (const k of required) {
  if (!process.env[k]) {
    throw new Error(
      `vitest setup: env var ${k} is required but unset.\n` +
        `Run \`pnpm test:setup\` to boot the local Supabase test stack and write web/.env.test.`,
    );
  }
}

// ─── Prod-data guardrail ──────────────────────────────────────────────
// The integration tests are destructive. Refuse to run them against any
// non-local Supabase URL unless the operator explicitly opts in. This is
// the single check that stands between a typo and corrupted live data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isLocal = /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(url);
const override = process.env.ALLOW_NONLOCAL_TEST_DB === "1";

if (!isLocal && !override) {
  throw new Error(
    [
      "",
      "╔══════════════════════════════════════════════════════════════════╗",
      "║ REFUSING TO RUN: integration tests target a NON-LOCAL Supabase.    ║",
      "╚══════════════════════════════════════════════════════════════════╝",
      `  NEXT_PUBLIC_SUPABASE_URL = ${url}`,
      "",
      "  These suites INSERT/DELETE rows and must run against the local",
      "  test stack, not production.",
      "",
      "  Fix: run `pnpm test:setup` (boots local Supabase + writes",
      "  web/.env.test), then `pnpm test`.",
      "",
      "  Escape hatch (read-only-vs-live runs only): set",
      "  ALLOW_NONLOCAL_TEST_DB=1 — you accept the risk to live data.",
      "",
    ].join("\n"),
  );
}

// Global afterAll: drop any `zzz-`/`ZZZ-` test fixture rows the per-suite
// cleanups may have missed (e.g. when a test threw mid-flight). On the
// local stack this is pure hygiene; the URL guard above ensures it can
// never sweep production. Runs once per test file (`fileParallelism:
// false`); idempotent.
afterAll(async () => {
  const { purgeZzzFixtures } = await import("./__tests__/db/_clients");
  await purgeZzzFixtures();
});
