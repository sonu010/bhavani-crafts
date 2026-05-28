---
id: P3-T03
phase: 3
title: Landing — caption strip
status: not_started
depends_on: [P3-T02]
estimate_hours: 1
owner: ai
last_updated: 2026-05-18
---

# Goal

A thin tabbed metadata strip under the hero with husk-200 hairlines
top + bottom: `MADE IN HYDERABAD · STOCKED IN 200 SCHOOLS · OPEN
TUES–SUN`.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #2
- P3-T02 — hero (this sits directly below)

# Files to touch

- `web/src/app/(storefront)/_landing/caption-strip.tsx` (new) — static
  server component.
- `web/src/app/(storefront)/page.tsx` (modified) — mount below hero.

# Implementation notes

- **Static content** — these three facts are hard-coded copy, not data.
  Keep them in a constant at the top of the file so the owner can edit
  in one place.
- JetBrains Mono, uppercase, letter-spacing ~0.2em, stone-500.
  Separator is a middot. husk-200 hairline border-y.
- Mobile: horizontal scroll-x with the three items in a single row
  (overflow-x-auto, no wrap) OR stack — prefer single scrollable row
  to keep the "ticker" feel.

# Acceptance criteria

- [ ] Strip renders the three facts with hairlines top + bottom.
- [ ] Mono uppercase, middot separators, stone-500.
- [ ] No horizontal overflow of the page at 360px (strip may scroll
      internally).
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# / → strip sits under hero with hairlines
```

# Dependencies added

(none)

# Notes for next agent

(empty)
