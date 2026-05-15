---
id: PX-TYY
phase: 0                    # 0 | 1 | 2 | 3 | 4 | 5
title: <short imperative title>
status: not_started         # not_started | in_progress | done | blocked
depends_on: []              # array of task ids, e.g. [P0-T04, P0-T05]
estimate_hours: 2
owner: ai                   # ai | owner | shared
last_updated: 2026-05-15
---

# Goal

One paragraph in **user-facing terms.** What changes after this task is done? Not "implement the foo," but "the admin can now do X" or "the storefront now renders Y."

# Prerequisites (read first)

- claude/architecture/<relevant-doc>.md (specific section)
- claude/decisions/ADR-XXX-<relevant>.md
- Any existing files this task builds on, with paths

# Files to touch

- `web/path/to/file.tsx` (new | modified | deleted)
- `web/supabase/migrations/<NNNN>_...sql` (new)
- ...

# Implementation notes

Specific guidance the next AI needs:
- Patterns to follow
- Utilities to reuse (with paths)
- Pitfalls to avoid
- API choices already locked

# Acceptance criteria

- [ ] Behavior A works as described
- [ ] Behavior B works
- [ ] No console errors at 360px viewport (mobile pass)
- [ ] Tests added
- [ ] CI green
- [ ] Audit log entry created (if mutation)
- [ ] Revalidation called (if mutation, see caching-and-revalidation.md)

# Verification

Exact commands to run after implementation:

```bash
cd web
pnpm tsc --noEmit
pnpm test --filter <relevant>
pnpm dev
# Then in browser:
# 1. Open <route>
# 2. Do <action>
# 3. Confirm <observation>
```

# Dependencies added

(none) — or list each new package with a one-line justification.

# Notes for next agent

<filled in when status → done; surprises, follow-ups, doc updates needed>
