---
id: P3-T13
phase: 3
title: Product detail page
status: not_started
depends_on: [P3-T01]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

`/p/[slug]` renders the full PDP: gallery slot (T14), title, price,
stock, short + long (markdown) description, attributes table, variant
selector slot (T15), add-to-cart, related slot (T16). Honors the
admin preview token so unpublished products are viewable via a signed
`?preview=` link (P2-T17).

# Prerequisites (read first)

- claude/architecture/caching-and-revalidation.md — `/p/<slug>` path +
  `product:<slug>` tag (admin emits on image/variant edits)
- `web/src/lib/db/products.ts` — `getProductBySlug` (full detail shape)
- `web/src/lib/auth/preview-token.ts` — `verifyPreviewToken` (P2-T17)
- P3-T01 — layout + `<ProductCard>` (for related)

# Files to touch

- `web/src/app/(storefront)/p/[slug]/page.tsx` (new) — server
  component; assembles the PDP.
- `web/src/app/(storefront)/p/[slug]/add-to-cart.tsx` (new) — client;
  add-to-cart button wired to the cart store (T21).

# Implementation notes

- **Route `/p/[slug]`** (matches admin revalidation). `notFound()`
  when missing.
- **Preview mode:** read `searchParams.preview`. If present, call
  `verifyPreviewToken(token, product.id)`; when valid, render even if
  `is_published=false`. Otherwise the public visibility rule (RLS /
  is_published) applies — unpublished → 404. The preview path must use
  a service-role read (the product is invisible to anon RLS), gated
  ONLY by a valid token. Keep that read isolated + token-checked.
- **Caching:** the public (non-preview) read wraps `unstable_cache(…,
  ['pdp', slug], { tags: ['products', 'product:'+slug], revalidate:
  300 })`. The preview read is NEVER cached.
- **Markdown description** renders through the existing markdown
  pipeline (sanitized) — reuse the admin editor's renderer if shared,
  else `markdown-editor.tsx`'s sanitize path.
- **Attributes table:** the product's `product_attributes` joined to
  definitions (name, value, unit). Read-only.
- `generateMetadata` (title, description, og:image = first image).
  JSON-LD lands in T17.

# Acceptance criteria

- [ ] `/p/[slug]` renders title, price, stock, descriptions,
      attributes, add-to-cart.
- [ ] Unknown/unpublished slug → 404 for anon.
- [ ] Valid `?preview=<token>` renders an unpublished product; expired
      / mismatched token → 404 (falls back to public rule).
- [ ] Public read wrapped in `unstable_cache` with product tags;
      preview read uncached.
- [ ] Public render is cached (`export const revalidate` set); the
      preview branch is the ONLY `force-dynamic`-equivalent path in
      Phase 3 — per the T00 performance contract.
- [ ] `generateMetadata` populates title + og:image.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /p/<published-slug> → full PDP
# Admin → Publish tab → "Preview as anonymous" on an unpublished product
#   → opens /p/<slug>?preview=… and renders
# Tamper the token → 404
```

# Dependencies added

(none)

# Notes for next agent

(empty)
