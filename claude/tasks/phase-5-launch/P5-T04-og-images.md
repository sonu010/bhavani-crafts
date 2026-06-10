---
id: P5-T04
phase: 5
title: OG images per route family
status: done
depends_on: [P5-T00]
estimate_hours: 2
owner: ai
last_updated: 2026-06-10
---

# Goal

When someone shares a Bhavani Crafts link on WhatsApp / Slack / X /
LinkedIn, the unfurl shows a branded preview image. After this task
the storefront has dynamic OG images via Next 16's `opengraph-image`
file convention:

- **Home** (`/`) — brand wordmark + tagline on a cream/teal canvas
- **Category** (`/c/[slug]`) — category name + tile from Atlas data
- **PDP** (`/p/[slug]`) — product name + price + primary image
- **Fallback** — anything else inherits the home OG

# Prerequisites (read first)

- `web/src/app/layout.tsx` — already sets `metadataBase` +
  `openGraph` defaults; per-page generateMetadata overrides PDP +
  category titles + URLs
- `web/src/app/(storefront)/p/[slug]/page.tsx` generateMetadata —
  currently sets `openGraph.images` to the raw product image URL;
  this task replaces that with the generated OG
- `architecture/design-system.md` §"Colors" — paper-0 (#FFFCF6) +
  bark-900 (#1A1A1A) + teal-800 (#0F3B3A) drive the OG palette

# Files to touch

- `web/src/app/opengraph-image.tsx` (new) — global default
  (1200×630, brand wordmark + tagline)
- `web/src/app/(storefront)/c/[slug]/opengraph-image.tsx` (new)
- `web/src/app/(storefront)/p/[slug]/opengraph-image.tsx` (new)
- `web/src/lib/storefront/og-template.tsx` (new) — shared JSX layout
  function. Each per-route OG imports + passes its own props.
- Per-page `generateMetadata` (modified) — drop the explicit
  `openGraph.images` overrides. Next 16 auto-injects when the file
  convention exists.
- `web/e2e/anon/og-images.spec.ts` (new) — assert each route's
  `<meta property="og:image">` resolves to a 200 image of the
  expected dimensions.

# Implementation notes

- **`ImageResponse` from `next/og`** — JSX → 1200×630 PNG rendered
  on the edge. No external service.
- **Shared layout** in `og-template.tsx` taking
  `{ title, subtitle?, accentColor?, imageUrl? }` keeps the four OGs
  visually consistent.
- **PDP OG** fetches `getProductBySlug` for the image + price. Null
  image → text-only template (same as home).
- **`export const revalidate = 86400`** so OG images regen daily —
  brand changes don't cache forever.
- **Font:** include Newsreader subset (~30KB) in the OG handler.
  Falling back to system serif loses the brand. The font is bundled
  with the route's edge function so cold-start adds ~50ms — fine.
- **Edge runtime:** `export const runtime = "edge"` on each handler.
  ImageResponse needs it.
- **Size limit:** ≤ 8 MB; 1200×630 PNG at default quality is ~200 KB
  for text-only, ~500 KB with a product image embedded.

# Acceptance criteria

- [x] `curl /opengraph-image` returns a 1200×630 PNG (verified
      locally: 46 KB).
- [x] `curl /c/<slug>/opengraph-image` shows the category name —
      verified for `3d-outliners` (1200×630 PNG, 36 KB).
- [x] `curl /p/<slug>/opengraph-image` shows the product name +
      price — verified (1200×630 PNG, 55 KB; image inlining
      deliberately skipped — see note on Satori+WebP below).
- [x] PDP HTML `<meta property="og:image">` points at the per-PDP
      OG URL (auto-injected by Next 16 file convention; verified
      against `localhost:4321/p/<slug>` HTML).
- [x] `e2e/anon/og-images.spec.ts` asserts the meta tag resolves to
      a 200 + Content-Type starts with `image/` (path is rebased
      onto Playwright's baseURL so it works in any environment).
- [x] No build error or edge runtime exception.
- [ ] Spot-check on opengraph.xyz or metatags.io — deferred to
      P5-T09 final QA (needs live preview URL).

# Verification

```bash
pnpm build && pnpm start
curl -sI http://localhost:3000/opengraph-image | head -5
curl -sI http://localhost:3000/p/brass-diya-small/opengraph-image | head -5
pnpm playwright test e2e/anon/og-images.spec.ts
```

# Notes for next agent

- **Shared template at `web/src/lib/storefront/og-template.tsx`**:
  the only place the OG visual is defined. `ogTemplate({ title,
  eyebrow?, priceLabel?, imageUrl? })` returns the JSX node the
  three file-convention handlers pass to `new ImageResponse(...)`.
  Brand tweak → one file.
- **Three file-convention handlers** (Next 16 finds them automatically):
  - `web/src/app/opengraph-image.tsx` — global default (home + any
    route without its own colocated handler)
  - `web/src/app/(storefront)/c/[slug]/opengraph-image.tsx`
  - `web/src/app/(storefront)/p/[slug]/opengraph-image.tsx`
- **Removed explicit `openGraph.images` overrides** in:
  - `src/app/(storefront)/p/[slug]/page.tsx`
  - `src/app/(storefront)/c/[slug]/page.tsx`
  Next 16 auto-injects from the file convention; keeping a manual
  override would double-emit + the manual one would win.
- **Satori does NOT support WebP / AVIF.** Entire catalogue is
  WebP, so the PDP OG handler now strips WebP URLs and the
  template renders text-only. To start showing product images:
  either backfill non-WebP variants (PNG/JPEG thumbnails) or pipe
  through Vercel's image optimizer (`/_next/image?url=...`). Drop
  the WebP guard in `p/[slug]/opengraph-image.tsx` when one of
  those lands.
- **Fallback path is deliberate.** Each handler wraps the read in
  try/catch and renders a branded card with the home title rather
  than failing the OG request. Crawlers always get an image —
  worst case it's branded but generic.
- **24h `revalidate` on each handler** so a brand-copy tweak lands
  in share previews within a day.
- **No font bundling yet.** Template uses `fontFamily: "serif"`
  which renders cleanly enough at 80px+ to feel brand-y but isn't
  Newsreader. Promoting to the real display face is a follow-up
  (bundle a `Newsreader-DisplayBold.ttf` subset via the
  `next/og`'s `fonts:` option to ImageResponse).
- **E2E test** (`web/e2e/anon/og-images.spec.ts`): goes to the
  page, reads the og:image meta tag, parses its path, refetches
  against Playwright's baseURL (the embedded URL uses
  `metadataBase` which is the production origin), checks
  status=200 + content-type starts with `image/`, and verifies
  width/height meta tags are 1200/630.
- **Verified locally 2026-06-10**: home 46 KB · category
  (3d-outliners) 36 KB · product 55 KB. All 1200×630 RGBA PNGs.
