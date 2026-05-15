---
id: P0-T07
phase: 0
title: Write design tokens (CSS vars + Tailwind theme)
status: not_started
depends_on: [P0-T06]
estimate_hours: 2
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the design system from `claude/architecture/design-system.md` is wired into CSS variables and Tailwind theme. Every shadcn component, every page, every section uses our tokens — not the shadcn neutral defaults. A dev-only `/design` route renders the full token palette + every component for visual verification.

# Prerequisites (read first)

- claude/architecture/design-system.md (entire file — colors, type, spacing, motion, components)
- claude/decisions/ADR-005-newsreader-manrope-jetbrains-mono.md

# Files to touch

- `web/src/app/globals.css` — replace shadcn default CSS variables with the Bhavani palette (50→900 ladders for clay, teal, saffron, cream/paper, bark, stone, husk, moss, brick)
- `web/tailwind.config.ts` — extend `theme.colors`, `theme.fontFamily`, `theme.borderRadius`, `theme.boxShadow`, `theme.transitionTimingFunction`
- `web/src/app/layout.tsx` — load Newsreader, Manrope, JetBrains Mono via `next/font/google`; expose CSS variables
- `web/src/components/ui/button.tsx` — override variants to match design-system.md (primary = teal-800 bg cream-50 text, secondary = transparent + husk-300 border, ghost, destructive = brick-600)
- `web/src/app/(dev)/design/page.tsx` (new) — internal swatch + component gallery
- `web/src/app/(dev)/layout.tsx` (new) — gates the (dev) route group to dev mode only

# Implementation notes

**Color ladders (50→900)** — generate via OKLCH so the lightness steps are perceptually even. Tools: any OKLCH generator. For each key hex, produce 11 stops. Examples (illustrative, P0-T07 generates exact values):

```css
/* in globals.css under @layer base */
:root {
  --color-cream-50:  #FAF5EE;
  --color-paper-0:   #FFFCF6;
  --color-husk-100:  #F0E8D6;
  --color-husk-200:  #E6DCC9;
  --color-husk-300:  #D4C5A3;
  --color-stone-500: #6E665B;
  --color-bark-900:  #1C1815;

  --color-teal-50:  ...
  --color-teal-100: ...
  --color-teal-800: #1F4E4A;
  --color-teal-900: #163834;

  --color-clay-50:  ...
  --color-clay-600: #B8552E;
  --color-clay-700: #9A4423;

  --color-saffron-500: #D8A24A;
  --color-moss-600:    #5A7A5C;
  --color-brick-600:   #B8312E;

  --font-display: 'Newsreader', Georgia, serif;
  --font-body:    'Manrope', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 24px;

  --shadow-soft: 0 1px 2px rgba(28,24,21,0.06), 0 4px 12px rgba(28,24,21,0.04);

  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  background-color: var(--color-cream-50);
  color: var(--color-bark-900);
  font-family: var(--font-body);
}
```

**Tailwind config** — mirror these in `theme.extend.colors` (so `bg-teal-800`, `text-bark-900` work). Use the `tailwindcss-animate` defaults; do not add `animate-*` utilities beyond what shadcn needs.

**Font loading** in `web/src/app/layout.tsx`:

```ts
import { Newsreader, Manrope, JetBrains_Mono } from 'next/font/google';

const display = Newsreader({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'], style: ['normal', 'italic'] });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
```

Then on `<html>`: `<html className={`${display.variable} ${body.variable} ${mono.variable}`}>`.

**The `/design` route** is gated to development. Use a `(dev)` route group that calls `notFound()` if `process.env.NODE_ENV === 'production'`. It renders:
- Every color swatch with its computed contrast ratio against the appropriate text color
- Every typography scale entry (Display, H1..H3, Body, Caption)
- Every button variant in idle / hover / focus / disabled state
- Inputs, badges, tabs, dialog, sheet, sonner toast, skeleton, table

**Append the rendered swatch matrix to `claude/architecture/design-system.md`** under the "Appendix" section. This is the file's source-of-truth audit; updated whenever tokens change.

# Acceptance criteria

- [ ] `/design` route loads in dev, 404s in production build.
- [ ] All shadcn components render with our palette (no slate/zinc anywhere).
- [ ] Newsreader appears on headings; Manrope on body; JetBrains Mono on prices/SKU swatches in the design page.
- [ ] Tailwind classes `bg-teal-800 text-cream-50` work.
- [ ] No pure black `#000` or pure white `#fff` appears in `globals.css` or component overrides (verified via grep).
- [ ] Primary button focus ring is 2px teal-800 at 2px offset.
- [ ] Contrast audit appended to `claude/architecture/design-system.md`.

# Verification

```bash
cd web
grep -nE "#000\b|#000000\b|#fff\b|#ffffff\b" src/app/globals.css src/components/ui/ && echo "FAIL: pure black/white found" || echo "OK"
pnpm dev
# Open http://localhost:3000/design and inspect every section
pnpm build && pnpm next start &  # then confirm /design returns 404 in prod build
```

# Dependencies added

None (Tailwind + shadcn already installed).

# Notes for next agent

(filled in when status → done)
