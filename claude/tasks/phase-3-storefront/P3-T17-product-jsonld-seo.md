---
id: P3-T17
phase: 3
title: Product JSON-LD (SEO)
status: done
depends_on: [P3-T13]
estimate_hours: 1
owner: ai
last_updated: 2026-05-29
---

# Goal

Each PDP emits valid schema.org `Product` JSON-LD (name, image, sku,
description, offers with price + INR currency + availability) so
search engines render rich results.

# Prerequisites (read first)

- P3-T13 — PDP (data already fetched)
- claude/architecture/overview.md — currency is INR

# Files to touch

- `web/src/app/(storefront)/p/[slug]/product-jsonld.tsx` (new) —
  renders a `<script type="application/ld+json">`.
- `web/src/app/(storefront)/p/[slug]/page.tsx` (modified) — mount it.

# Implementation notes

- Build the JSON object server-side from the already-fetched product;
  no extra query. Fields: `@type: Product`, name, image (array of
  public image URLs), sku, description (plain-text, strip markdown),
  brand (Bhavani Crafts), `offers: { @type: Offer, priceCurrency: INR,
  price, availability: schema.org/InStock|OutOfStock from stock_status,
  url }`.
- Use the resolved-variant price if a default variant exists; else
  base price. For variant products, optionally emit `AggregateOffer`
  with low/high price.
- Serialize with `JSON.stringify`; inject via
  `dangerouslySetInnerHTML` (standard for JSON-LD). Escape `<` to
  avoid script-injection in description text.
- Don't emit JSON-LD on the preview (unpublished) render.

# Acceptance criteria

- [ ] PDP includes a `Product` JSON-LD script that validates
      (schema.org validator / Google Rich Results test).
- [ ] Price uses INR; availability maps from stock_status.
- [ ] Description is plain-text (markdown stripped), HTML-safe.
- [ ] No JSON-LD on preview renders.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# View source on /p/<slug> → ld+json present + parses
# Paste into search.google.com/test/rich-results → valid Product
```

# Dependencies added

(none)

# Notes for next agent

  - `p/[slug]/product-jsonld.tsx` (server). Builds schema.org Product
    server-side from the already-fetched PdpView — no extra query.
    Markdown→plain-text via inline regex strip; cap 5000 chars (Google
    limit). HTML-escapes `<` so a malicious description can't break out
    of the script tag.
  - Variant pricing: if any two variant prices differ → `AggregateOffer`
    with `lowPrice`/`highPrice`/`offerCount` + aggregate availability
    (InStock if any variant is in_stock/low_stock). Otherwise → single
    `Offer` from default variant or product base.
  - Skipped on the preview render — we don't want crawlers indexing
    unpublished products via a leaked signed link.
  - New `lib/storefront/site-url.ts` resolves the canonical origin:
    `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `http://localhost:3000`.
    Added env example. Reused by sitemap/robots at T24.
  - E2E verified: simple product → Offer ₹250 InStock; variant product →
    AggregateOffer 950–1300 INR offerCount≥2; preview render → 0 scripts.
