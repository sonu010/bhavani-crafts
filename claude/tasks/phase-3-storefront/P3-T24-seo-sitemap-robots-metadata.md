---
id: P3-T24
phase: 3
title: SEO — sitemap, robots, metadata
status: done
depends_on: [P3-T13, P3-T10]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

The storefront is discoverable: a dynamic `sitemap.xml` listing all
published products + categories + static pages, a `robots.txt` that
allows the storefront and disallows `/admin` + `/auth`, and
per-route metadata (Open Graph + canonical URLs). (NEW task added in
P3-T00 expansion — was unowned.)

# Prerequisites (read first)

- Next 16 metadata APIs — `app/sitemap.ts`, `app/robots.ts`,
  `generateMetadata`. READ `node_modules/next/dist/docs/` for the
  current API (this Next has breaking changes vs training data).
- P3-T13 / P3-T10 — PDP + category `generateMetadata` already set
  title/description; this task adds OG + canonical + the sitemap.
- `web/src/lib/db/products.ts` + `categories.ts` — enumerate published
  rows for the sitemap.

# Files to touch

- `web/src/app/sitemap.ts` (new) — dynamic sitemap; enumerates
  published products (`/p/<slug>`) + non-deleted categories
  (`/c/<slug>`) + static routes (`/`, `/search`).
- `web/src/app/robots.ts` (new) — allow `/`, disallow `/admin`,
  `/auth`, `/api`; point at the sitemap.
- `web/src/app/(storefront)/p/[slug]/page.tsx` (modified) — add OG +
  canonical to `generateMetadata`.
- `web/src/app/(storefront)/c/[slug]/page.tsx` (modified) — same.
- `web/src/lib/db/products.ts` (modified, optional) — a lightweight
  `listAllPublishedSlugs(supabase)` for the sitemap (paginated; could
  be thousands of rows).

# Implementation notes

- **Sitemap scale:** ~5.8K products. Next's `sitemap.ts` can return a
  large array; if it ever exceeds the 50K-URL / 50MB limit, split via
  `generateSitemaps`. For now one sitemap is fine. Paginate the DB
  read (1000-row chunks — same PostgREST cap lesson as the admin).
  Cache it (`revalidate` on the route) so it's not regenerated per hit.
- **robots:** admin + auth + api must be disallowed; the admin pages
  already set `robots: noindex` per-page, but robots.txt is the
  crawler-level guard.
- **Canonical URLs** use the production origin from an env var
  (`NEXT_PUBLIC_SITE_URL`); add to .env.example. OG images = the
  product's first image (PDP) / a default share image (category +
  home).
- **Lastmod** in the sitemap = `updated_at` so crawlers see freshness.

# Acceptance criteria

- [ ] `/sitemap.xml` lists published products + categories + static
      routes with lastmod; excludes unpublished + soft-deleted.
- [ ] `/robots.txt` allows storefront, disallows /admin /auth /api,
      references the sitemap.
- [ ] PDP + category pages emit OG tags + canonical URLs.
- [ ] `NEXT_PUBLIC_SITE_URL` documented in .env.example.
- [ ] Sitemap DB read paginated; route cached.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm build && pnpm start
# curl localhost:3000/sitemap.xml | head ; curl localhost:3000/robots.txt
# View source on /p/<slug> → og:title, og:image, canonical present
```

# Dependencies added

(none)

# Notes for next agent

  - `app/sitemap.ts` + `app/robots.ts` + canonical/OG on PDP + category
    + title-template at root layout.
  - **Sitemap** paginates products + categories via `listAllPublishedSlugs`
    / `listAllCategorySlugs` (new helpers in lib/db/products.ts +
    categories.ts; 1000-row chunks to beat the PostgREST cap). Each entry
    carries `lastmod` from `updated_at`. Wrapped in `readOrEmpty` so a
    DB outage degrades to a static-pages-only sitemap. `export const
    revalidate = 3600` — Next 16 caches the route response.
  - **robots.txt** allows `/`, disallows `/admin /auth /api /design`,
    points at `/sitemap.xml`, includes `Host:` for the canonical origin.
  - **PDP + category metadata** now emit `alternates.canonical`, `openGraph`
    (type/title/description/url/images/locale), and `twitter` card on the
    PDP. `metadataBase` lives on root layout so relative URLs resolve.
  - **Title template gotcha (cost me a rebuild):** setting `title` (even
    `{ absolute }`) in the storefront layout overrides the root template
    for every descendant — PDP titles silently dropped the suffix. Fix:
    put the home tagline in `title.default` at ROOT (default is NOT
    templated), drop the storefront override, let children with string
    titles inherit the template. Documented in SESSION-RESUME.
  - **Stripped " — Bhavani Crafts" from 22 page titles** (admin + auth +
    storefront + storefront layout); the root template applies the
    suffix universally now. Login + admin shell + verify-2fa + categories/
    products/etc were all updated by a python sweep.
  - All verified live: robots blocks 4 prefixes, sitemap has 19 entries
    (home + search + 8 categories + 9 products) all with lastmod, PDP
    canonical absolute via metadataBase, og:image/title/description/url
    correct, title template wraps "X — Bhavani Crafts" on every page.
