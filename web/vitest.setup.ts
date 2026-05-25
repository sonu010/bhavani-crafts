/**
 * Load web/.env.local into process.env for tests.
 * Fails fast if any required key is missing.
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(__dirname, ".env.local");
if (!fs.existsSync(envPath)) {
  throw new Error(`vitest setup: web/.env.local not found at ${envPath}`);
}
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
for (const k of required) {
  if (!process.env[k]) {
    throw new Error(`vitest setup: env var ${k} is required but unset`);
  }
}

// Global afterAll: drop any `zzz-` test fixture rows the per-suite
// cleanups may have missed (e.g. when a test threw mid-flight). Keeps
// the admin UI free of leaked fixture rows. Runs once per test file
// with this vitest config (`fileParallelism: false`); idempotent.
import { afterAll } from "vitest";

afterAll(async () => {
  // Lazy import so the env-load step at the top of this file isn't
  // gated on the supabase client construction.
  const { purgeZzzFixtures } = await import("./__tests__/db/_clients");
  await purgeZzzFixtures();
});
