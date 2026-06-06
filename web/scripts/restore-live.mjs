/**
 * Roll the LIVE catalog back to a JSON snapshot taken by
 * scripts/backup-live.mjs. This is the "accidents happen, be ready" lever.
 *
 *   # DRY RUN (default) — prints what WOULD change, writes nothing:
 *   node scripts/restore-live.mjs backups/20260528-181019
 *
 *   # EXECUTE — requires typing the exact target host as confirmation:
 *   node scripts/restore-live.mjs backups/20260528-181019 --confirm=lyycugadkxjtevmugqol.supabase.co
 *
 * What it does: upserts every backed-up row (parent tables → child tables)
 * keyed on the primary key, restoring rows that were changed or
 * soft/hard-deleted AFTER the snapshot back to their snapshot state.
 *
 * What it does NOT do: it does not DELETE rows created after the snapshot
 * (an upsert can't know about them). For a true point-in-time restore
 * after catastrophic loss, use the full SQL dump path in
 * claude/runbooks/backup-and-restore.md (§"Full SQL restore").
 *
 * Guardrails:
 *   - Dry-run unless --confirm=<host> is passed AND matches the live host.
 *   - Refuses to run against a local stack (this is a prod tool).
 *   - Uses the service-role key from web/.env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const backupDir = process.argv[2];
const confirmArg = process.argv.find((a) => a.startsWith("--confirm="));
const confirmHost = confirmArg ? confirmArg.split("=")[1] : null;

if (!backupDir) {
  console.error("Usage: node scripts/restore-live.mjs <backup-dir> [--confirm=<host>]");
  process.exit(1);
}
if (!existsSync(path.join(backupDir, "manifest.json"))) {
  console.error(`No manifest.json in ${backupDir}. Is it a backup-live.mjs snapshot?`);
  process.exit(1);
}

// ─── Load web/.env.local (LIVE) ───────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (/127\.0\.0\.1|localhost|0\.0\.0\.0/.test(url)) {
  console.error(`restore-live: .env.local is a LOCAL stack (${url}). This tool restores the live project.`);
  process.exit(1);
}
const host = new URL(url).host;
const dryRun = confirmHost !== host;

// Parent tables first so FKs resolve. Composite-PK tables list their keys.
const RESTORE_ORDER = [
  { table: "categories", onConflict: "id" },
  { table: "attribute_definitions", onConflict: "id" },
  { table: "tags", onConflict: "id" },
  { table: "products", onConflict: "id" },
  { table: "product_images", onConflict: "id" },
  { table: "product_options", onConflict: "id" },
  { table: "product_option_values", onConflict: "id" },
  { table: "product_variants", onConflict: "id" },
  { table: "product_attributes", onConflict: "product_id,attribute_id" },
  { table: "product_tags", onConflict: "product_id,tag_id" },
  { table: "search_synonyms", onConflict: "id" },
];

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CHUNK = 500;

async function main() {
  console.log(
    `${dryRun ? "DRY RUN" : "EXECUTING"} restore of ${backupDir} → ${host}\n` +
      (dryRun
        ? `  (no writes — pass --confirm=${host} to execute)\n`
        : `  (writing upserts to LIVE)\n`),
  );

  for (const { table, onConflict } of RESTORE_ORDER) {
    const file = path.join(backupDir, `${table}.json`);
    if (!existsSync(file)) {
      console.log(`  ${table}: (no file, skip)`);
      continue;
    }
    const rows = JSON.parse(readFileSync(file, "utf8"));
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${table}: would upsert ${rows.length} rows (onConflict=${onConflict})`);
      continue;
    }
    let done = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await sb.from(table).upsert(chunk, { onConflict });
      if (error) throw new Error(`${table} [${i}..${i + chunk.length}]: ${error.message}`);
      done += chunk.length;
    }
    console.log(`  ${table}: upserted ${done} rows`);
  }

  console.log(dryRun ? "\n✔ Dry run complete. Nothing was written." : "\n✔ Restore complete.");
}

main().catch((err) => {
  console.error("restore-live failed:", err.message ?? err);
  process.exit(1);
});
