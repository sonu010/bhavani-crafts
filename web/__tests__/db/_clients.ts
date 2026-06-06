/**
 * Shared test helpers for the data-layer integration tests.
 *
 * Two clients:
 *   - anon — what unauthenticated users see (RLS public-select only)
 *   - srv  — service-role; bypasses RLS for fixture setup + cleanup
 *
 * Every test that touches data uses anon for the function under test and
 * srv for housekeeping. Mixing roles in the same assertion is forbidden.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

// ─── Prod-data guardrail (defense in depth) ───────────────────────────
// vitest.setup.ts already refuses a non-local URL, but this module owns
// the service-role client that actually performs the destructive
// INSERT/DELETE. Re-assert here so anything importing `srv` (a stray
// script, a misconfigured run) cannot touch a live project by accident.
const _url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const _isLocal = /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(_url);
if (!_isLocal && process.env.ALLOW_NONLOCAL_TEST_DB !== "1") {
  throw new Error(
    `__tests__/db/_clients: refusing to build a destructive test client ` +
      `against non-local Supabase URL "${_url}". Run \`pnpm test:setup\` ` +
      `or set ALLOW_NONLOCAL_TEST_DB=1 to override (you accept the risk).`,
  );
}

export const anon: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export const srv: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Insert a transient published product via service-role for tests that need
 * one. Returns { productId, categoryId, cleanup }. Always pair the
 * cleanup() call with afterAll() or afterEach().
 */
export async function makeTestProduct(opts: {
  slug: string;
  sku: string;
  name: string;
  basePriceInr?: number | null;
  shortDescription?: string;
}) {
  const catSlug = `${opts.slug}-cat`;
  const { data: cat, error: catErr } = await srv
    .from("categories")
    .insert({ slug: catSlug, name: `Test cat ${opts.slug}` })
    .select("id")
    .single();
  if (catErr) throw catErr;

  const { data: prod, error: prodErr } = await srv
    .from("products")
    .insert({
      sku: opts.sku,
      slug: opts.slug,
      name: opts.name,
      short_description: opts.shortDescription ?? null,
      base_price_inr: opts.basePriceInr ?? 100,
      stock_status: "in_stock",
      category_id: cat.id,
      is_published: true,
      review_status: "published",
      source: "manual",
    })
    .select("id")
    .single();
  if (prodErr) throw prodErr;

  return {
    productId: prod.id,
    categoryId: cat.id,
    cleanup: async () => {
      await srv.from("products").delete().eq("id", prod.id);
      await srv.from("categories").delete().eq("id", cat.id);
    },
  };
}

/**
 * Prefix-based purge for the `zzz-…` fixture rows. Call from a
 * test-suite's `afterAll` to drop rows the per-test cleanups missed
 * (e.g. when a test throws mid-flight). Idempotent; safe to call when
 * nothing matches.
 *
 * The `scripts/purge-test-fixtures.mjs` script does the same thing
 * across the whole DB — this helper is the per-suite version so each
 * file cleans up after itself without depending on the manual script.
 */
export async function purgeZzzFixtures(): Promise<void> {
  const targets: Array<{ table: string; column: string; prefix: string }> = [
    { table: "product_variants", column: "sku", prefix: "ZZZ-" },
    { table: "product_images", column: "alt", prefix: "zzz-" },
    { table: "products", column: "slug", prefix: "zzz-" },
    { table: "products", column: "sku", prefix: "ZZZ-" },
    { table: "attribute_definitions", column: "slug", prefix: "zzz-" },
    { table: "categories", column: "slug", prefix: "zzz-" },
    { table: "tags", column: "slug", prefix: "zzz-" },
  ];
  for (const { table, column, prefix } of targets) {
    // Cast through unknown because the typed query rejects unknown
    // table names; this helper is generic on purpose.
    const tbl = srv.from(table as never) as unknown as {
      delete: () => {
        like: (
          c: string,
          p: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await tbl.delete().like(column, `${prefix}%`);
    if (error) {
      // Best-effort cleanup; log and continue.
      console.warn(`purgeZzzFixtures ${table}.${column}: ${error.message}`);
    }
  }
}
