---
id: P0-T06
phase: 0
title: Install shadcn/ui primitives
status: done
depends_on: [P0-T05]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the shadcn/ui primitives we need are installed in `web/src/components/ui/` and theme-able via our design tokens (added in P0-T07).

# Prerequisites (read first)

- claude/architecture/design-system.md (component guardrails)

# Files to touch

- `web/components.json` (created by `shadcn init`)
- `web/src/components/ui/*` (created by `shadcn add`)
- `web/src/lib/utils.ts` (created by `shadcn init`; contains `cn()` helper)

# Implementation notes

```bash
cd web
pnpm dlx shadcn@latest init
# Answers:
#   Style: New York
#   Base color: Neutral (we override in P0-T07; this is just the starting CSS)
#   CSS variables: yes
#   Tailwind config: tailwind.config.ts
#   Components path: @/components/ui

pnpm dlx shadcn@latest add button card input label badge dialog sheet tabs separator dropdown-menu select textarea checkbox table pagination sonner skeleton scroll-area
```

After install:
- We do **not** keep the default shadcn color palette — P0-T07 replaces it.
- Customize `button.tsx` variants to match design-system.md (primary teal-800, secondary husk-300 outline, destructive brick-600, ghost, no gradients).
- All shadcn components must follow the "no pure black/white in custom tokens" rule from design-system.md.

# Acceptance criteria

- [ ] `web/components.json` exists.
- [ ] `web/src/lib/utils.ts` has `cn()` helper.
- [ ] All listed shadcn components exist under `web/src/components/ui/`.
- [ ] `pnpm tsc --noEmit` passes.

# Verification

```bash
cd web
ls src/components/ui/ | wc -l    # should be ≥ 17
pnpm tsc --noEmit
```

# Dependencies added

shadcn pulls in: `@radix-ui/react-*` for each component, `class-variance-authority`, `cmdk` (if installed), `tailwindcss-animate`. All are framework defaults; no per-package justification required beyond shadcn itself.

# Notes for next agent

**Done 2026-05-15.** `pnpm dlx shadcn@latest init --defaults --yes` created `components.json` + `src/lib/utils.ts` + `button.tsx` and updated `globals.css` (it added `@import "tw-animate-css"` and a full `@theme inline { ... }` block of shadcn-semantic CSS variable mappings — kept and built on top of in P0-T07).

Then `shadcn add card input label badge dialog sheet tabs separator dropdown-menu select textarea checkbox table sonner skeleton scroll-area --yes` added 16 more components.

**One delta from the task spec:** `pagination` was not added — shadcn no longer ships a separate `pagination` component in the registry. We'll build cursor pagination as a project-specific component in P2-T07 / P3-T12 instead.

shadcn default palette (zinc/neutral) is replaced wholesale by P0-T07.
