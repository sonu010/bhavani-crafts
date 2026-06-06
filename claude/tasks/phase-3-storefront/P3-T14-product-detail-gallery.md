---
id: P3-T14
phase: 3
title: Product detail — gallery
status: done
depends_on: [P3-T13]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

The PDP gallery: a main image with thumbnail strip, ordered by
`product_images.sort_order`, blur-up placeholders, and keyboard +
swipe navigation. Only images with a public license status render.

# Prerequisites (read first)

- P3-T13 — PDP shell
- claude/architecture/database-schema.md §"product_images" —
  `license_status` gates public visibility (RLS in 0006)
- `web/src/lib/db/products.ts` — `getProductBySlug` embeds images

# Files to touch

- `web/src/app/(storefront)/p/[slug]/gallery.tsx` (new) — client;
  main image + thumbnails + nav.

# Implementation notes

- **License gate:** RLS already filters images to
  `license_status IN ('owned','licensed','public_domain')` for anon.
  Trust RLS; don't re-filter, but handle the zero-image case (show a
  placeholder).
- **Order** by `sort_order` (the admin reorder in P2-T16 sets it).
- next/image with `blur_data_url` placeholders; main image priority
  (LCP candidate — set `priority` on the first image for Lighthouse).
- Thumbnail click swaps the main image; arrow keys + touch swipe
  navigate. Keep it dependency-free if practical (no carousel lib);
  a small state machine over the image array.

# Acceptance criteria

- [ ] Gallery renders ordered images with a thumbnail strip.
- [ ] First image has `priority` (LCP); rest lazy with blur-up.
- [ ] Keyboard arrows + touch swipe navigate.
- [ ] Zero-image product shows a graceful placeholder.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /p/<slug> with multiple images → swap via thumbnails + arrows + swipe
```

# Dependencies added

(none) — avoid a carousel dependency unless justified.

# Notes for next agent

  - `gallery.tsx` client. Main image with `priority` (LCP), thumb
    strip, keyboard arrows (when gallery has focus), and touch swipe
    (50px threshold). Dependency-free state machine. Thumbnails are real
    `<button role=tab>` with `aria-selected` / `aria-current`. Zero-image
    fallback shows a husk-100 placeholder card. License-status gate is
    already enforced by RLS — we just render what we got.
