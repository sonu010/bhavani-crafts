---
id: P3-T23
phase: 3
title: Lighthouse pass (perf budget)
status: not_started
depends_on: [P3-T22]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

The storefront hits the performance budget: Lighthouse mobile
Performance ≥ 90, Accessibility ≥ 95, Best Practices + SEO ≥ 95 on
`/`, `/c/[slug]`, `/p/[slug]`. LCP < 2.5s, CLS < 0.1, no layout shift
from images.

# Prerequisites (read first)

- claude/architecture/caching-and-revalidation.md — cached reads keep
  TTFB low
- P3-T22 — mobile pass (accessibility overlaps)
- P3-T14 — gallery LCP image `priority`

# Files to touch

- Cross-cutting tuning across storefront routes. Likely:
  next/image `sizes` audits, `priority` on LCP images, font-display,
  removing the visit-section map iframe (T08 already prefers a static
  image), lazy-loading below-the-fold sections, ensuring
  `unstable_cache` is actually wrapping the hot reads.

# Implementation notes

- **LCP:** hero image (T02) + PDP first gallery image (T14) get
  `priority` + correct `sizes`. Everything below the fold is lazy.
- **CLS:** every image has explicit width/height or aspect-ratio
  container (the 4:5 ProductCard already does). Reserve space for
  async sections.
- **Fonts:** confirm `next/font` with `display: swap`; subset if
  large. No FOUT-induced shift.
- **JS budget:** storefront is mostly server components; keep client
  bundles small (cart store, search box, gallery, variant selector are
  the only client islands). Verify no accidental "use client" on big
  trees.
- **Caching:** confirm category/PDP/landing reads are `unstable_cache`
  wrapped so TTFB is fast + admin revalidation still flushes.
- **Accessibility:** alt text on all images (PDP uses
  `product_images.alt`), landmark regions, focus order, color
  contrast (design tokens are AA-verified already).

# Acceptance criteria

- [ ] Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, Best Practices ≥ 95,
      SEO ≥ 95 on /, /c/<slug>, /p/<slug>.
- [ ] LCP < 2.5s; CLS < 0.1; no image-driven layout shift.
- [ ] LCP images have `priority` + correct `sizes`; below-fold lazy.
- [ ] Client JS islands stay minimal (no giant "use client" trees).
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm build && pnpm start
# Lighthouse (mobile) on /, /c/<slug>, /p/<slug>; capture scores
npx unlighthouse --site http://localhost:3000   # optional bulk scan
```

# Dependencies added

(none) — `unlighthouse` optional dev-only, not a runtime dep.

# Notes for next agent

(empty)
