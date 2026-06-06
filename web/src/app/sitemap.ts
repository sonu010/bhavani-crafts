import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/db/public-client";
import { listAllPublishedSlugs } from "@/lib/db/products";
import { listAllCategorySlugs } from "@/lib/db/categories";
import { siteUrl } from "@/lib/storefront/site-url";
import { readOrEmpty } from "@/lib/storefront/safe-read";

/**
 * Dynamic sitemap (P3-T24). Lists every published, non-deleted product
 * (`/p/<slug>`) + every non-deleted category (`/c/<slug>`) + the static
 * storefront routes, with `lastmod` from each row's `updated_at`.
 *
 * Catalog is ~5.8K products; we cap at 50k URLs per file (sitemap.org
 * spec). If we ever exceed that, switch to `generateSitemaps` to split.
 *
 * Cached at the route level (1h revalidate) — the response can be
 * several hundred KB; we don't want to regenerate per crawler hit. The
 * DB read uses `createPublicClient` (cookie-less, RLS-gated to public-
 * select), wrapped in `readOrEmpty` so a transient DB outage degrades
 * to a static-pages-only sitemap rather than failing the route.
 */
export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/search", changeFrequency: "weekly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const now = new Date();

  const supabase = createPublicClient();
  const [products, categories] = await Promise.all([
    readOrEmpty("sitemap-products", () => listAllPublishedSlugs(supabase), []),
    readOrEmpty("sitemap-categories", () => listAllCategorySlugs(supabase), []),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${origin}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${origin}/c/${c.slug}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${origin}/p/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
