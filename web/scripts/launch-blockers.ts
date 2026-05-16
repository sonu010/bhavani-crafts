#!/usr/bin/env tsx
/**
 * web/scripts/launch-blockers.ts
 *
 * Deploy gate. Runs every check that MUST hold before going live.
 * Exits 0 if all green; non-zero otherwise.
 *
 * Two kinds of checks:
 *   SQL launch-blockers (7):  no Just Kraft seed leakage, no unlicensed
 *                              published images, review_status alignment.
 *                              Mirror of claude/runbooks/launch-blockers.sql.
 *   Runtime RLS probes (4):   prove anon clients cannot see unpublished
 *                              data and cannot mutate anything.
 *
 * Run manually before any production deploy:
 *   pnpm tsx scripts/launch-blockers.ts        (from web/)
 *
 * Wired into CI in a follow-up — for now, run by hand at deploy time.
 *
 * See claude/architecture/security.md §"Service-role key isolation".
 * Uses service-role for SQL counts (need full visibility) and anon for
 * the RLS probes (the role we're testing).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import type { Database } from "../src/lib/db/types.gen";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(HERE, "..", ".env.local");

// ─── Env ────────────────────────────────────────────────────────────────
if (!fs.existsSync(ENV_PATH)) {
  throw new Error(`web/.env.local not found at ${ENV_PATH}`);
}
for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SRV) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required in web/.env.local",
  );
}

const anon: SupabaseClient<Database> = createClient<Database>(URL_, ANON);
const srv: SupabaseClient<Database> = createClient<Database>(URL_, SRV, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Result accumulator ────────────────────────────────────────────────
type CheckResult = { name: string; pass: boolean; detail?: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<CheckResult>) {
  try {
    results.push(await fn());
  } catch (err) {
    results.push({
      name,
      pass: false,
      detail: `threw: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function main() {
// ─── SQL launch-blockers ───────────────────────────────────────────────
await check("1. no published seed-sourced products", async () => {
  const { count, error } = await srv
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .is("deleted_at", null)
    .eq("source", "justkraft_seed");
  if (error) throw new Error(error.message);
  return {
    name: "1. no published seed-sourced products",
    pass: (count ?? 0) === 0,
    detail: `count=${count ?? 0}`,
  };
});

await check("2. no public image URLs pointing at Just Kraft CDN", async () => {
  // Need to join product_images → products to filter by parent is_published.
  // Easier: query product_images directly with a like filter, then filter
  // in JS to those whose parent product is published + non-deleted.
  const { data, error } = await srv
    .from("product_images")
    .select("id, url, product_id")
    .or("url.ilike.%djl2kq23xfhqi.cloudfront.net%,url.ilike.%justkraft%")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    return { name: "2. no public image URLs pointing at Just Kraft CDN", pass: true, detail: "count=0" };
  }
  // Filter to images whose parent product is published.
  const pids = Array.from(new Set(data.map((d) => d.product_id)));
  const { data: pubProds, error: pErr } = await srv
    .from("products")
    .select("id")
    .in("id", pids)
    .eq("is_published", true)
    .is("deleted_at", null);
  if (pErr) throw new Error(pErr.message);
  const leakedCount = pubProds?.length ?? 0;
  return {
    name: "2. no public image URLs pointing at Just Kraft CDN",
    pass: leakedCount === 0,
    detail: `published-product image rows pointing at the CDN: ${leakedCount}`,
  };
});

await check("3. no published product source_url containing 'justkraft'", async () => {
  const { count, error } = await srv
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .is("deleted_at", null)
    .ilike("source_url", "%justkraft%");
  if (error) throw new Error(error.message);
  return {
    name: "3. no published product source_url containing 'justkraft'",
    pass: (count ?? 0) === 0,
    detail: `count=${count ?? 0}`,
  };
});

await check("4. no published description containing 'just kraft' or 'justkraft'", async () => {
  // Need OR across two columns. Use the .or() syntax.
  const { count, error } = await srv
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .is("deleted_at", null)
    .or("description.ilike.%just kraft%,description.ilike.%justkraft%,short_description.ilike.%just kraft%,short_description.ilike.%justkraft%");
  if (error) throw new Error(error.message);
  return {
    name: "4. no published description containing 'just kraft'",
    pass: (count ?? 0) === 0,
    detail: `count=${count ?? 0}`,
  };
});

await check("5. every published product has ≥1 licensed image", async () => {
  // Find published products that have NO image with license_status IN
  // (owned, licensed, public_domain).
  const { data: pubProducts, error: e1 } = await srv
    .from("products")
    .select("id")
    .eq("is_published", true)
    .is("deleted_at", null);
  if (e1) throw new Error(e1.message);
  if (!pubProducts || pubProducts.length === 0) {
    return {
      name: "5. every published product has ≥1 licensed image",
      pass: true,
      detail: "no published products in DB (vacuously satisfied)",
    };
  }
  const pubIds = pubProducts.map((p) => p.id);
  const { data: licensedImages, error: e2 } = await srv
    .from("product_images")
    .select("product_id")
    .in("product_id", pubIds)
    .is("deleted_at", null)
    .in("license_status", ["owned", "licensed", "public_domain"]);
  if (e2) throw new Error(e2.message);
  const pidsWithLicensed = new Set((licensedImages ?? []).map((r) => r.product_id));
  const missing = pubIds.filter((pid) => !pidsWithLicensed.has(pid));
  return {
    name: "5. every published product has ≥1 licensed image",
    pass: missing.length === 0,
    detail: `published-without-licensed-image count=${missing.length}`,
  };
});

await check("5b. no published image with license_status in (unverified, disputed, removed)", async () => {
  const { data: badImages, error: e1 } = await srv
    .from("product_images")
    .select("product_id")
    .is("deleted_at", null)
    .in("license_status", ["unverified", "disputed", "removed"]);
  if (e1) throw new Error(e1.message);
  if (!badImages || badImages.length === 0) {
    return { name: "5b. no published image with bad license_status", pass: true, detail: "count=0" };
  }
  // Filter to those whose parent product is published.
  const pids = Array.from(new Set(badImages.map((i) => i.product_id)));
  const { data: pubProds, error: e2 } = await srv
    .from("products")
    .select("id")
    .in("id", pids)
    .eq("is_published", true)
    .is("deleted_at", null);
  if (e2) throw new Error(e2.message);
  const leaked = pubProds?.length ?? 0;
  return {
    name: "5b. no published image with bad license_status",
    pass: leaked === 0,
    detail: `published-products-with-bad-license-images=${leaked}`,
  };
});

await check("5c. review_status aligns with is_published", async () => {
  const { count: mismatchA, error: eA } = await srv
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("review_status", "published")
    .eq("is_published", false);
  if (eA) throw new Error(eA.message);

  const { count: mismatchB, error: eB } = await srv
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("review_status", "archived")
    .eq("is_published", true);
  if (eB) throw new Error(eB.message);

  const total = (mismatchA ?? 0) + (mismatchB ?? 0);
  return {
    name: "5c. review_status aligns with is_published",
    pass: total === 0,
    detail: `mismatches: published+unpub=${mismatchA ?? 0}, archived+pub=${mismatchB ?? 0}`,
  };
});

// ─── Runtime RLS probes ────────────────────────────────────────────────

await check("6. anon cannot read unpublished products", async () => {
  // Create a transient unpublished product via service-role.
  const { data: cat, error: e1 } = await srv
    .from("categories")
    .insert({ slug: "zzz-blocker-rls-cat", name: "Blocker RLS" })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);
  const { data: prod, error: e2 } = await srv
    .from("products")
    .insert({
      sku: "ZZZ-BLOCKER-RLS",
      slug: "zzz-blocker-rls",
      name: "Blocker probe (transient)",
      category_id: cat.id,
      is_published: false,
      review_status: "draft",
    })
    .select("id")
    .single();
  if (e2) throw new Error(e2.message);

  const { data: leaked } = await anon.from("products").select("id").eq("id", prod.id);

  // Cleanup
  await srv.from("products").delete().eq("id", prod.id);
  await srv.from("categories").delete().eq("id", cat.id);

  return {
    name: "6. anon cannot read unpublished products",
    pass: (leaked?.length ?? 0) === 0,
    detail: `leaked rows: ${leaked?.length ?? 0}`,
  };
});

await check("7. anon cannot INSERT into products", async () => {
  const { error } = await anon.from("products").insert({
    sku: "ZZZ-ANON-INSERT-ATTEMPT",
    slug: "zzz-anon-insert-attempt",
    name: "Should be rejected",
  });
  // Expect error code 42501 (Postgres insufficient_privilege).
  return {
    name: "7. anon cannot INSERT into products",
    pass: error?.code === "42501",
    detail: error ? `error code=${error.code}` : "INSERT succeeded — RLS broken",
  };
});

await check("8. anon UPDATE of a published product leaves the row unchanged", async () => {
  // Create a published product, attempt update via anon, verify name unchanged.
  const { data: cat, error: e1 } = await srv
    .from("categories")
    .insert({ slug: "zzz-blocker-update-cat", name: "Blocker update" })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);
  const { data: prod, error: e2 } = await srv
    .from("products")
    .insert({
      sku: "ZZZ-BLOCKER-UPD",
      slug: "zzz-blocker-update",
      name: "Original",
      category_id: cat.id,
      is_published: true,
      review_status: "published",
    })
    .select("id")
    .single();
  if (e2) throw new Error(e2.message);

  await anon.from("products").update({ name: "Hacked" }).eq("id", prod.id);
  const { data: post, error: e3 } = await srv
    .from("products")
    .select("name")
    .eq("id", prod.id)
    .single();
  if (e3) throw new Error(e3.message);

  await srv.from("products").delete().eq("id", prod.id);
  await srv.from("categories").delete().eq("id", cat.id);

  return {
    name: "8. anon UPDATE leaves row unchanged",
    pass: post.name === "Original",
    detail: `final name="${post.name}"`,
  };
});

await check("9. anon cannot read audit_logs", async () => {
  const { data, error } = await anon.from("audit_logs").select("id").limit(1);
  // anon should get either: data === [] (no rows visible) OR an error.
  // Either is acceptable. The bad case is `data` containing rows.
  return {
    name: "9. anon cannot read audit_logs",
    pass: (data?.length ?? 0) === 0,
    detail: error ? `error=${error.code}` : `rows visible=${data?.length ?? 0}`,
  };
});

await check("10. anon CAN read search_synonyms (needed for query expansion)", async () => {
  const { data, error } = await anon.from("search_synonyms").select("term").limit(1);
  if (error) {
    return {
      name: "10. anon CAN read search_synonyms",
      pass: false,
      detail: `error=${error.code}: ${error.message}`,
    };
  }
  return {
    name: "10. anon CAN read search_synonyms",
    pass: (data?.length ?? 0) >= 1,
    detail: `rows=${data?.length ?? 0}`,
  };
});

  // ─── Report ────────────────────────────────────────────────────────────
  let passCount = 0;
  let failCount = 0;
  console.log("\nLaunch blockers — verify before any production deploy.\n");
  for (const r of results) {
    console.log(r.pass ? "  PASS" : "  FAIL", r.name, r.detail ? `(${r.detail})` : "");
    if (r.pass) passCount++;
    else failCount++;
  }
  console.log(`\n${passCount} passed, ${failCount} failed of ${results.length} checks.`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nLaunch-blockers harness crashed:", err);
  process.exit(2);
});
