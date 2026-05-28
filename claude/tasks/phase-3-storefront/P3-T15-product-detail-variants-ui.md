---
id: P3-T15
phase: 3
title: Product detail — variants UI
status: not_started
depends_on: [P3-T13]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

When a product has variants, the PDP shows option selectors (Size,
Color, …); picking one value per option resolves the matching variant
and updates price, stock, and the add-to-cart target. The default
variant is preselected.

# Prerequisites (read first)

- P3-T13 — PDP shell + add-to-cart
- claude/architecture/database-schema.md §"Variants model"
- P2-T14 — the variants data model: `product_options` →
  `product_option_values` → `product_variants` via
  `variant_option_values`; partial-unique default constraint
- `web/src/lib/db/products.ts` — ensure `getProductBySlug` embeds
  options + values + variants + the junction (extend if not)

# Files to touch

- `web/src/app/(storefront)/p/[slug]/variant-selector.tsx` (new) —
  client; option pickers + resolved-variant state.
- `web/src/lib/db/products.ts` (modified, if needed) — embed the full
  variant graph in the PDP read.
- `web/src/app/(storefront)/p/[slug]/add-to-cart.tsx` (modified) —
  accept the resolved variant.

# Implementation notes

- **Resolution:** a variant matches when its `variant_option_values`
  set equals the selected (one value per option). Build a lookup from
  the embedded graph client-side. Preselect the `is_default` variant.
- **Price/stock** update to the resolved variant's `price_inr` /
  `stock_status` (fall back to the product's base when a variant lacks
  its own).
- **Unavailable combos:** if a selected combo has no variant, disable
  add-to-cart + show "Not available". Optionally grey out option
  values that would produce no variant.
- **No variants:** the selector renders nothing; add-to-cart targets
  the product directly.
- Add-to-cart payload carries the variant id + sku so the cart line is
  variant-specific.

# Acceptance criteria

- [ ] Products with options show selectors; default variant
      preselected.
- [ ] Selecting values resolves the variant + updates price/stock.
- [ ] Invalid combo disables add-to-cart with a clear message.
- [ ] Variant-less products skip the selector.
- [ ] Cart line carries variant id + sku.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /p/<slug-with-variants> → pick Size+Color → price/stock update →
#   add to cart → cart shows the right variant
```

# Dependencies added

(none)

# Notes for next agent

(empty)
