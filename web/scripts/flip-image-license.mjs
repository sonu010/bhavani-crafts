#!/usr/bin/env node
/**
 * One-shot: flip every product_image with license_status='unverified'
 * (or any non-public value) to 'owned' so the storefront can render
 * them. Mirrors flip-publish-all.mjs — saves the prior status per id
 * for clean revert.
 *
 * RLS gate (0006_rls.sql): product_images_public_select requires
 *   license_status IN ('owned', 'licensed', 'public_domain')
 * Seeded JustKraft images come in as 'unverified' (default for the
 * scraped/imported source) and are therefore invisible to anon. This
 * script flips them so the live storefront preview has full coverage.
 *
 * Usage:
 *   node scripts/flip-image-license.mjs          # apply
 *   node scripts/flip-image-license.mjs --revert # restore prior values
 *
 * Reads creds from web/.env.local. Touches the LIVE project.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tiny .env.local loader — matches flip-publish-all.mjs.
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

const STATE_FILE = join(__dirname, ".flip-image-license-state.json");
const REVERT = process.argv.includes("--revert");
const PAGE = 1000;
const PUBLIC_VALUES = new Set(["owned", "licensed", "public_domain"]);

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
  const groups = new Map(); // priorStatus -> ids[]
  for (const [id, prior] of Object.entries(state.priorById)) {
    if (!groups.has(prior)) groups.set(prior, []);
    groups.get(prior).push(id);
  }
  console.log(`Reverting ${Object.keys(state.priorById).length} images across ${groups.size} prior status(es)…`);
  for (const [prior, ids] of groups) {
    const CHUNK = 200;
    let n = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error, count } = await srv
        .from("product_images")
        .update({ license_status: prior }, { count: "exact" })
        .in("id", slice);
      if (error) throw error;
      n += count ?? 0;
    }
    console.log(`  ${prior}: ${n}`);
  }
  console.log("Reverted.");
  process.exit(0);
}

// Apply: page through every product_image whose license_status is NOT
// in the public-allowed set, record its prior status, flip to 'owned'.
const touched = []; // {id, prior}
let from = 0;
while (true) {
  const { data, error } = await srv
    .from("product_images")
    .select("id, license_status")
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data.length) break;
  for (const row of data) {
    if (!PUBLIC_VALUES.has(row.license_status)) {
      touched.push({ id: row.id, prior: row.license_status });
    }
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`Found ${touched.length} images with non-public license_status. Flipping to 'owned'…`);

const CHUNK = 200;
let n = 0;
for (let i = 0; i < touched.length; i += CHUNK) {
  const slice = touched.slice(i, i + CHUNK).map((t) => t.id);
  const { error } = await srv
    .from("product_images")
    .update({ license_status: "owned" })
    .in("id", slice);
  if (error) throw error;
  n += slice.length;
}

writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      count: touched.length,
      priorById: Object.fromEntries(touched.map((t) => [t.id, t.prior])),
    },
    null,
    2,
  ),
);
console.log(`Flipped ${n} rows. State saved to ${STATE_FILE}.`);
console.log("Revert with: node scripts/flip-image-license.mjs --revert");
