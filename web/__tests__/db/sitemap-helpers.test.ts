/**
 * Tests for the sitemap-feeding helpers:
 *   - `listAllPublishedSlugs` (lib/db/products.ts)
 *   - `listAllCategorySlugs` (lib/db/categories.ts)
 *
 * These power the `/sitemap.xml` route. They paginate PAST PostgREST's
 * 1000-row cap by internally chunking — a regression in either would
 * silently truncate the sitemap, hurting SEO without raising any
 * error.
 *
 * Pins:
 *   1. listAllPublishedSlugs returns slugs ONLY for is_published=true,
 *      deleted_at IS NULL.
 *   2. Each slug entry has the matching updated_at (for <lastmod>).
 *   3. Unpublished + soft-deleted products are excluded.
 *   4. listAllCategorySlugs excludes soft-deleted.
 *   5. (Indirect): both helpers tolerate datasets without crashing
 *      when run end-to-end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";
import { listAllPublishedSlugs } from "@/lib/db/products";
import { listAllCategorySlugs } from "@/lib/db/categories";

const TAG = `zzz-sitemap-${Date.now()}`;
const allProdIds: string[] = [];
const allCatIds: string[] = [];

beforeAll(async () => {
  // Seed two categories: one live + one soft-deleted.
  const { data: cats } = await srv
    .from("categories")
    .insert([
      { slug: `${TAG}-cat-live`, name: `${TAG} live cat` },
      {
        slug: `${TAG}-cat-dead`,
        name: `${TAG} dead cat`,
        deleted_at: new Date().toISOString(),
      },
    ])
    .select("id, slug");
  for (const c of cats ?? []) allCatIds.push(c.id as string);
  const liveCatId = (cats ?? []).find((c) =>
    (c.slug as string).endsWith("-cat-live"),
  )!.id as string;

  // Seed four products: published, unpublished, soft-deleted, and
  // published-under-deleted-category (still published per its own
  // flag — the sitemap helper only looks at product gates).
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-PUB`,
        slug: `${TAG}-pub`,
        name: `${TAG} pub`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: liveCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-UNPUB`,
        slug: `${TAG}-unpub`,
        name: `${TAG} unpub`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: liveCatId,
        is_published: false,
        review_status: "needs_review" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-DEL`,
        slug: `${TAG}-del`,
        name: `${TAG} deleted`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: liveCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
        deleted_at: new Date().toISOString(),
      },
      {
        sku: `${TAG.toUpperCase()}-PUB2`,
        slug: `${TAG}-pub2`,
        name: `${TAG} pub2`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: liveCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id");
  for (const p of prods ?? []) allProdIds.push(p.id as string);
}, 60_000);

afterAll(async () => {
  await srv.from("products").delete().in("id", allProdIds);
  await srv.from("categories").delete().in("id", allCatIds);
}, 60_000);

describe("listAllPublishedSlugs (sitemap)", () => {
  it("returns only published, non-deleted products", async () => {
    const all = await listAllPublishedSlugs(anon);
    const ourSlugs = all
      .map((r) => r.slug)
      .filter((s) => s.startsWith(`${TAG}-`));
    // Expect: pub, pub2 — NOT unpub, NOT deleted.
    expect(ourSlugs.sort()).toEqual([`${TAG}-pub`, `${TAG}-pub2`].sort());
  });

  it("each row carries an updated_at timestamp for <lastmod>", async () => {
    const all = await listAllPublishedSlugs(anon);
    const ours = all.filter((r) => r.slug.startsWith(`${TAG}-`));
    expect(ours.length).toBeGreaterThan(0);
    for (const row of ours) {
      expect(typeof row.updated_at).toBe("string");
      // ISO-ish — parses to a valid date.
      expect(Number.isNaN(new Date(row.updated_at).getTime())).toBe(false);
    }
  });

  it("returns an array even when no rows match (no throw)", async () => {
    // We can't easily get an empty result from anon (other seeded
    // rows exist); assert only that the helper's array shape is
    // preserved.
    const all = await listAllPublishedSlugs(anon);
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("listAllCategorySlugs (sitemap)", () => {
  it("excludes soft-deleted categories", async () => {
    const all = await listAllCategorySlugs(anon);
    const slugs = all.map((r) => r.slug).filter((s) => s.startsWith(`${TAG}-cat-`));
    expect(slugs).toContain(`${TAG}-cat-live`);
    expect(slugs).not.toContain(`${TAG}-cat-dead`);
  });

  it("each row carries an updated_at timestamp", async () => {
    const all = await listAllCategorySlugs(anon);
    const ours = all.filter((r) => r.slug.startsWith(`${TAG}-cat-`));
    expect(ours.length).toBeGreaterThanOrEqual(1);
    for (const row of ours) {
      expect(typeof row.updated_at).toBe("string");
      expect(Number.isNaN(new Date(row.updated_at).getTime())).toBe(false);
    }
  });
});
