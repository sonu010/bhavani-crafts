---
id: P0-T06
phase: 0
title: Install shadcn/ui primitives
status: not_started
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

(filled in when status → done)
