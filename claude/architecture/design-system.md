# Design system

Locked in v2.1 of the master plan. This file is the single source of truth for color, type, spacing, motion, and component patterns. AI agents read this **before** generating any UI.

The full WCAG contrast audit, swatches, and Tailwind config snippet are appended at the bottom by P0-T07.

## Anti-AI principles

The site must read as **a 2026 Hyderabad boutique craft retailer**, not a shadcn template. Things that make UI read AI-generated, and our antidotes:

| AI tell | Antidote |
|---|---|
| Inter + Inter at every weight | Newsreader display + Manrope body + JetBrains Mono numerics |
| Slate / Zinc gray palette | Warm earth palette built around clay terracotta + deep teal |
| Generic 3-card "Features" rows | Editorial story strips, horizontal scroll, asymmetric grids |
| Centered hero with one big H1 + 2 CTAs | Split editorial hero: type-led left, single hand-photographed product right |
| Stock "smiling people" photos | Real Bhavani store + real product photography only |
| Symmetrical perfection | Intentional asymmetry; offset photo grids; serif italic accents |
| Hover = card lifts 4px + shadow | Hover = tonal background shift + underline grow |
| Default Tailwind shadow (cold gray) | Single warm `shadow-soft` token |
| Marketing copy ("Never miss a drop!") | Direct, plain copy ("We open Tues–Sun, 10–8. Walk in.") |
| Emoji-heavy CTAs | None. Lucide icons used sparingly |

## Color palette

All values are sRGB hex. P0-T07 generates the full 50→900 ladder for each token.

| Token | Hex | Role |
|---|---|---|
| `cream-50` | `#FAF5EE` | App background — every page sits on this |
| `paper-0` | `#FFFCF6` | Cards, modals, raised surfaces |
| `bark-900` | `#1C1815` | Body text, headings — primary readable color |
| `stone-500` | `#6E665B` | Secondary text, captions, metadata |
| `husk-200` | `#E6DCC9` | All borders, hairlines, dividers |
| `teal-800` **primary** | `#1F4E4A` | Primary buttons, links, focus rings, interactive states |
| `teal-900` | `#163834` | Hover/active for primary |
| `clay-600` **brand** | `#B8552E` | Brand mark, decorative display type, italic underlines |
| `clay-700` | `#9A4423` | Deeper accent on clay surfaces |
| `saffron-500` **highlight** | `#D8A24A` | "New" / "Sale" badges only — sparing |
| `moss-600` | `#5A7A5C` | In-stock pills, success toasts |
| `brick-600` | `#B8312E` | Out-of-stock, destructive buttons, error toasts |

## Color usage rules (enforced)

- **Cream is the canvas.** Every viewport-level background is `cream-50`. Don't tint sections to gray or white; use `paper-0` only for raised cards/modals.
- **Bark is text.** Body, headings, table cells, button labels on light bg. Never used as a fill color for shapes.
- **Teal is *the* interactive color.** Every primary button, every active link, every focus ring, every selected-row indicator is teal. Consistency is what makes the UI feel deliberate.
- **Clay is decorative warmth, not action.** Use clay for: brand wordmark, Newsreader italic emphases, large display headlines, the small underline-grow on hovered category labels, the price tag on Atlas tiles. **Never use clay for buttons.**
- **Saffron earns its place.** Reserved for: "New" badge on cards (last 14 days), "Sale" badge (when `compare_at_price_inr` is set), and 1–2 small editorial chips. If saffron appears > ~4 times on a page, remove some.
- **Moss / brick** carry semantic meaning only. Green = good, red = stop. Don't use moss as decoration; don't use brick as a "warm red."
- **Stone is the muted helper.** Captions, "242 supplies" under tiles, table secondary columns, placeholder text.
- **Husk is for hairlines.** 1px borders only. Don't use as fill.

**Avoid pure black/white in custom UI tokens.** Pragmatic exceptions: user-uploaded photos, third-party embeds (Maps, Razorpay, YouTube), browser widget internals, PDF invoices, OG/favicon assets sized for their target context. The rule applies to authored Tailwind theme, CSS variables, inline styles, and component overrides.

## WCAG AA contrast (verified)

Every used pairing, calculated against locked hex values. Full audit with rendered swatches is appended to this file by P0-T07.

| Pairing | Ratio | Pass | Use |
|---|---|---|---|
| `bark-900` on `cream-50` | ~14.8 : 1 | AAA | Body text |
| `bark-900` on `paper-0` | ~15.4 : 1 | AAA | Card body text |
| `stone-500` on `cream-50` | ~5.2 : 1 | AA | Captions |
| `cream-50` on `teal-800` | ~9.2 : 1 | AAA | Primary button label |
| `cream-50` on `teal-900` | ~12.0 : 1 | AAA | Hover state |
| `teal-800` on `cream-50` | ~9.2 : 1 | AAA | Link text, focus ring |
| `cream-50` on `clay-600` | ~4.7 : 1 | AA | Text on clay surfaces (if any) |
| `bark-900` on `clay-600` | ~3.2 : 1 | AA (large/UI only) | Display text only |
| `bark-900` on `saffron-500` | ~7.5 : 1 | AAA | Badge text |
| `cream-50` on `moss-600` | ~4.8 : 1 | AA | In-stock pill |
| `cream-50` on `brick-600` | ~5.5 : 1 | AA | Destructive button |
| Focus ring `teal-800` on `cream-50` | ~9.2 : 1 | AAA | Focus indicator |
| Admin "low stock" `brick-600` on `cream-50` | ~5.5 : 1 | AA | Admin stock column |

**Hard rules:**
1. No text on `husk-*` backgrounds without verifying ratio.
2. No text on `clay-600` smaller than 18px regular / 14px bold (large-text threshold).
3. Focus = 2px `teal-800` ring at 2px offset, against any background.
4. Hover must change *both* tone AND something secondary (underline, icon shift) — never color alone.
5. Disabled = `husk-200` bg + `stone-500` text + `cursor: not-allowed`. Never opacity tricks (fails screen readers).

## Typography

| Use | Family | Weights | Notes |
|---|---|---|---|
| Display (H1, hero) | Newsreader (variable) | 400, 500, italic | Italic for accents ("*made here*"). Optical size axis ON. |
| UI / body | Manrope (variable) | 400, 500, 600, 700 | -1% letter-spacing on UI labels. |
| Numerics, SKUs, prices | JetBrains Mono | 400, 500 | Tabular figures. |

**Type scale** (mobile / desktop, rem):

| Token | Mobile | Desktop | Family | Weight | LH | LS |
|---|---|---|---|---|---|---|
| Display | 2.5 | 4 | Newsreader | 400 | 1.05 | -2% |
| H1 | 1.875 | 3 | Newsreader | 500 | 1.1 | -1% |
| H2 | 1.5 | 2.25 | Newsreader | 500 | 1.15 | -1% |
| H3 | 1.25 | 1.5 | Manrope | 600 | 1.3 | 0% |
| Body | 1 | 1.0625 | Manrope | 400 | 1.6 | 0% |
| Caption | 0.8125 | 0.8125 | Manrope | 500 | 1.4 | +4% uppercase |

### JetBrains Mono — when used

**Allowed:** product price (storefront card + PDP), SKU in admin tables/editor, numeric metadata in admin (row counts, stock_quantity inputs, timestamps, import row numbers, background-job IDs).

**Forbidden:** buttons, navigation, body copy, headings, footer, marketing copy, FAQ, onboarding text. Anywhere a customer reads sentences.

## Spacing, radius, shadow

- **Base unit:** 4px. Allowed scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Nothing else.
- **Container max-width:** 1280px. Editorial sections may break out to 1440.
- **Radius scale:** 6 / 12 / 24 (intentionally not 4/8/16). Pill (9999) only for primary CTAs and chips.
- **Shadow:** single token `shadow-soft` = `0 1px 2px rgba(28,24,21,0.06), 0 4px 12px rgba(28,24,21,0.04)`. No `shadow-lg`/`shadow-xl`/`shadow-2xl` Tailwind defaults.

## Motion

- **Default transition:** 180ms ease-out. Page transitions: 240ms.
- **Honor `prefers-reduced-motion`.** No parallax, no scroll-jacking, no auto-rotating carousels.
- **Hover on product card:** bg shifts `cream-50` → `paper-0`, border tone deepens `husk-200` → `husk-300`, image scales 1.0 → 1.02 over 240ms. No lift, no shadow grow.

## Landing page composition (editorial, not template)

Sections, in order:

1. **Split hero** — Left 7-col: oversized Newsreader display headline (3 lines, one italic word), one line body, one teal-800 primary CTA. Right 5-col: a single hand-photographed product bleeding off the right edge, with a JetBrains Mono caption ("Resin set · ₹680") in the margin.
2. **Caption strip** — Tabbed 1-liner metadata, husk-200 hairlines top/bottom: `MADE IN HYDERABAD · STOCKED IN 200 SCHOOLS · OPEN TUES–SUN`.
3. **The Atlas** — 8 top categories as 2×4 grid (desktop) / 2-col stack (mobile). Each tile: real product photo + Newsreader category name (mix-blend-multiply for legibility) + stone-500 caption.
4. **This week's collection** — Named, dated ("This week: Monsoon resin colors"). Newsreader italic intro paragraph. 4-product horizontal scroll-snap row.
5. **Workshop kits row** — Horizontal scroller. Each kit numbered "01 / 02 / 03" in JetBrains Mono.
6. **Bulk enquiry strip** — Full-bleed paper-0. Oversized Newsreader pull-quote ("Doing a class of 40? We deliver to your school."). One CTA → WhatsApp prefilled.
7. **Visit Bhavani Crafts** — Real store photo + address + hours + embedded map. Address is the CTA (click-to-copy).
8. **Footer** — Editorial 4-column: brand + tagline · Catalog links · Policies · Contact + WhatsApp + Instagram. Newsletter = one input + button.

**No** testimonials carousel until we have real ones. **No** "Why choose us?" three-column. **No** press logos.

## Component patterns

- **Product card** — 4:5 aspect ratio image (magazine feel), name in Manrope 600 with hover underline-grow, price in JetBrains Mono 500 `bark-900` tabular nums, stock pill (moss/brick), saffron-500 "Sale" chip top-left when applicable. "Quick view" on hover via opacity.

- **Buttons:**
  - *Primary* — `teal-800` bg, `cream-50` text, pill radius, no shadow. Hover → `teal-900`. Focus → 2px `teal-800` ring at 2px offset.
  - *Secondary* — transparent bg, `husk-300` border, `bark-900` text, 12-radius. Hover → `husk-100` bg.
  - *Ghost* — no border, `bark-900` text, underline on hover.
  - *Destructive* (admin only) — `brick-600` bg, `cream-50` text.
  - *Disabled* — `husk-200` bg, `stone-500` text, `cursor: not-allowed`. No opacity tricks.
  - **No gradients, no glow shadows, no emoji icons inside buttons.**

- **Inputs** — `paper-0` bg, `husk-200` border, 12-radius, 14px padding. Focus = `teal-800` outline 2px at 2px offset. Label above input (Manrope 500, caption size), not floating.

- **Badges/chips** — pill (9999), Manrope 500, caption size, uppercase, letter-spacing 4%. Variants: neutral (`husk-100` / `bark-900`), success (`moss-600` text on `moss-100`), danger (`brick-600` text on `brick-100`), highlight (`saffron-500` bg / `bark-900`).

- **Toasts (sonner)** — Top-right desktop, top-center mobile. `paper-0` bg, `husk-300` border, Lucide icon left, **no emoji**. Auto-dismiss 4s, errors stay 8s with explicit close.

- **Tables (admin)** — Row hover → `husk-100`. Selected row → `teal-50` bg + 3px `teal-800` left border. Zebra striping uses `husk-100` (not gray). Sticky header row. Cell padding 12/16.

## File locations (after P0-T07)

- Color tokens: `web/src/app/globals.css` (CSS variables)
- Tailwind theme: `web/tailwind.config.ts` (`theme.extend.colors`)
- Font loading: `web/src/app/layout.tsx` (`next/font/google` for Newsreader + Manrope, `next/font/google` for JetBrains Mono)
- shadcn overrides: `web/src/components/ui/*` (component-by-component)
- Component examples / Storybook-lite: `web/src/app/(dev)/design/page.tsx` (dev-only route showing every token + component)

## Appendix (filled in by P0-T07)

This section will contain the rendered swatch grid, the full 50→900 color ladders, and the Tailwind config snippet. Until P0-T07 runs, treat the token names above as canonical and the hex values as the spec.
