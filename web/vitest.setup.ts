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
