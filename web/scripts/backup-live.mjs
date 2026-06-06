/**
 * Back up the LIVE catalog before any risky mutation (bulk edits,
 * imports, migrations, reseeds). This is the rollback safety net.
 *
 *   node scripts/backup-live.mjs           # from web/
 *   pnpm backup:live
 *
 * Writes a timestamped JSON snapshot of every catalog table to
 *   web/backups/<YYYYMMDD-HHMMSS>/<table>.json
 * plus a manifest.json with row counts. Uses ONLY the service-role key
 * from web/.env.local — no DB password, no extra tooling required.
 *
 * Reads are PAGINATED (1000 rows/page) so the 5.8K-row products table is
 * captured in full despite PostgREST's default max_rows cap.
 *
 * This JSON snapshot is the quick, inspectable, always-available net. For
 * a full-fidelity SQL backup (the authoritative artifact) and the restore
 * procedure, see claude/runbooks/backup-and-restore.md.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ─── Load web/.env.local (the LIVE project) ───────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("backup-live: web/.env.local not found. Run from web/.");
  process.exit(1);
}
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceKey) {
  console.error("backup-live: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local.");
  process.exit(1);
}
if (/127\.0\.0\.1|localhost|0\.0\.0\.0/.test(url)) {
  console.error(
    `backup-live: .env.local points at a LOCAL stack (${url}). ` +
      `Nothing worth backing up — this script is for the live project.`,
  );
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Catalog tables, parents before children (matters for a later restore).
const TABLES = [
  "categories",
  "attribute_definitions",
  "tags",
  "products",
  "product_images",
  "product_options",
  "product_option_values",
  "product_variants",
  "product_attributes",
  "product_tags",
  "search_synonyms",
];

const PAGE = 1000;

async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1)
      .order("id", { ascending: true });
    if (error) {
      // Some tables key on a composite PK (no `id`); retry without order.
      if (/column .*id.* does not exist/i.test(error.message)) {
        const retry = await sb.from(table).select("*").range(from, from + PAGE - 1);
        if (retry.error) throw new Error(`${table}: ${retry.error.message}`);
        rows.push(...(retry.data ?? []));
        if (!retry.data || retry.data.length < PAGE) break;
        continue;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/T/, "-")
    .replace(/\..+/, "");
  const outDir = path.join(process.cwd(), "backups", ts);
  mkdirSync(outDir, { recursive: true });

  const host = new URL(url).host;
  console.log(`Backing up live catalog @ ${host} → backups/${ts}/`);

  const manifest = { takenAt: new Date().toISOString(), host, tables: {} };
  for (const table of TABLES) {
    process.stdout.write(`  ${table} … `);
    const rows = await dumpTable(table);
    writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2), "utf8");
    manifest.tables[table] = rows.length;
    console.log(`${rows.length} rows`);
  }
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`✔ Snapshot complete: ${total} rows across ${TABLES.length} tables → backups/${ts}/`);
  console.log(
    `  For a full-fidelity SQL backup + restore steps see ` +
      `claude/runbooks/backup-and-restore.md`,
  );
}

main().catch((err) => {
  console.error("backup-live failed:", err.message ?? err);
  process.exit(1);
});
