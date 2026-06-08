---
id: P5-T04
phase: 5
title: OG images per route family
status: not_started
depends_on: [P5-T00]
estimate_hours: 2
owner: ai
last_updated: 2026-06-07
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

- [ ] `curl /opengraph-image` returns a 1200×630 image (PNG or WebP).
- [ ] `curl /c/<slug>/opengraph-image` shows the category name.
- [ ] `curl /p/<slug>/opengraph-image` shows the product name + price.
- [ ] PDP HTML `<meta property="og:image">` points at the per-PDP
      OG URL.
- [ ] `e2e/anon/og-images.spec.ts` asserts the meta tag resolves to
      a 200 + Content-Type starts with `image/`.
- [ ] No build error or edge runtime exception.
- [ ] Spot-check on opengraph.xyz or metatags.io shows the branded card.

# Verification

```bash
pnpm build && pnpm start
curl -sI http://localhost:3000/opengraph-image | head -5
curl -sI http://localhost:3000/p/brass-diya-small/opengraph-image | head -5
pnpm playwright test e2e/anon/og-images.spec.ts
```

# Notes for next agent

(empty)
