#!/usr/bin/env node
/**
 * scripts/validate-migrations.mjs
 *
 * Validate every web/supabase/migrations/*.sql file applies cleanly against
 * an embedded Postgres 17 (pglite, WASM) before we push to live Supabase.
 *
 * Strips lines that pglite can't handle but Supabase can:
 *   - CREATE EXTENSION pgcrypto / pg_trgm / unaccent  (Supabase-managed)
 *
 * Stubs:
 *   - auth schema + auth.users table  (Supabase Auth-managed)
 *   - auth.uid() function             (Supabase JWT helper)
 *
 * Usage:
 *   node scripts/validate-migrations.mjs
 *
 * Exits 0 on success, 1 on failure. Run before every `supabase db push`.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, "..", "supabase", "migrations");

// Lines pglite can't handle that Supabase provides natively.
const STRIP_EXTENSION = /^CREATE EXTENSION[^;]+;.*$/gm;

const AUTH_STUB = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
`;

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function preprocess(sql) {
  return sql.replace(STRIP_EXTENSION, "-- (CREATE EXTENSION stripped for pglite)");
}

async function main() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);

  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.error("No migrations found at", MIGRATIONS_DIR);
    process.exit(1);
  }

  console.log(`▶ Validating ${migrations.length} migration(s) against pglite (Postgres 17):\n`);

  for (const file of migrations) {
    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql = preprocess(fs.readFileSync(sqlPath, "utf8"));
    try {
      await db.exec(sql);
      console.log(`  ✅ ${file}`);
    } catch (err) {
      console.log(`  ❌ ${file}`);
      console.error("\n" + err.message);
      // Print a hint about where in the file the error is.
      const match = err.message.match(/line (\d+)/);
      if (match) console.error(`     near line ${match[1]} of ${file}`);
      process.exit(1);
    }
  }

  // Post-validation probes — surface high-signal facts about the resulting DB.
  const enums = await db.query(
    "SELECT count(*)::int AS c FROM pg_type WHERE typtype='e' AND typnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')"
  );
  const tables = await db.query(
    "SELECT count(*)::int AS c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'"
  );
  const indexes = await db.query(
    "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public'"
  );
  const fns = await db.query(
    "SELECT count(*)::int AS c FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"
  );

  console.log(
    `\n▶ Resulting schema: enums=${enums.rows[0].c} tables=${tables.rows[0].c} indexes=${indexes.rows[0].c} functions=${fns.rows[0].c}`
  );
  console.log("✅ All migrations applied cleanly.");
  await db.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Harness crashed:", err);
    process.exit(1);
  });
