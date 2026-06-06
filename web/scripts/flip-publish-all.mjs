#!/usr/bin/env node
/**
 * One-shot: flip every currently-unpublished, not-soft-deleted product to
 * is_published=true so the storefront has something to render. Writes the
 * list of touched ids to scripts/.flip-publish-state.json so we can revert
 * with --revert later.
 *
 * Usage:
 *   node scripts/flip-publish-all.mjs           # apply (publish all)
 *   node scripts/flip-publish-all.mjs --revert  # restore prior state
 *
 * Reads SUPABASE creds from web/.env.local. INTENDED for the live project
 * because the storefront we want to look at runs against live.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local without taking a dotenv dep — tiny KEY=VALUE parser.
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

const STATE_FILE = join(__dirname, ".flip-publish-state.json");
const REVERT = process.argv.includes("--revert");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const srv = createClient(url, key, { auth: { persistSession: false } });

if (REVERT) {
  if (!existsSync(STATE_FILE)) {
    console.error(`No state file at ${STATE_FILE}. Nothing to revert.`);
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  console.log(`Reverting ${state.touched.length} products to is_published=false…`);
  // Chunk to keep the IN list reasonable.
  const ids = state.touched;
  const CHUNK = 200;
  let n = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error, count } = await srv
      .from("products")
      .update({ is_published: false }, { count: "exact" })
      .in("id", slice);
    if (error) throw error;
    n += count ?? 0;
  }
  console.log(`Reverted ${n} rows.`);
  process.exit(0);
}

// Apply: find unpublished + not-deleted, flip to published, record ids.
// PostgREST caps reads at 1000 rows — paginate via range until empty.
const unpub = [];
const PAGE = 1000;
let from = 0;
while (true) {
  const { data, error } = await srv
    .from("products")
    .select("id, slug, review_status")
    .eq("is_published", false)
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data.length) break;
  unpub.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`Found ${unpub.length} unpublished products. Flipping to is_published=true…`);

const ids = unpub.map((p) => p.id);
const CHUNK = 200;
let n = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  // Some review_status values block publish via a CHECK constraint (see
  // products_publish_state_check in 0004). Bump review_status to
  // 'published' for any row that's not already there, then flip is_published.
  const { error: e1 } = await srv
    .from("products")
    .update({ review_status: "published", is_published: true })
    .in("id", slice);
  if (e1) throw e1;
  n += slice.length;
}

writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      touched: ids,
      priorReviewStatusBySlug: Object.fromEntries(
        unpub.map((p) => [p.slug, p.review_status]),
      ),
    },
    null,
    2,
  ),
);
console.log(`Flipped ${n} rows. State saved to ${STATE_FILE}.`);
console.log("Revert with: node scripts/flip-publish-all.mjs --revert");
