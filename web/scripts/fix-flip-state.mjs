#!/usr/bin/env node
/**
 * One-off: rebuild .flip-publish-state.json to cover ALL currently-
 * published, not-soft-deleted products. The first pass of
 * flip-publish-all.mjs hit PostgREST's 1000-row cap, then the second
 * pass overwrote the state with only its own ids. This script merges
 * both passes by snapshotting all is_published=true rows right now —
 * safe because the rebuild's seed published 0 products.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const srv = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const all = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await srv
    .from("products")
    .select("id, slug")
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data.length) break;
  all.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}

const STATE_FILE = join(__dirname, ".flip-publish-state.json");
const prior = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
writeFileSync(
  STATE_FILE,
  JSON.stringify(
    {
      ranAt: prior.ranAt ?? new Date().toISOString(),
      rebuiltAt: new Date().toISOString(),
      note: "All currently-published products; revert sets all back to is_published=false",
      touched: all.map((p) => p.id),
    },
    null,
    2,
  ),
);
console.log(`Rebuilt state file with ${all.length} ids.`);
