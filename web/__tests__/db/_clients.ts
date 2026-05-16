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
