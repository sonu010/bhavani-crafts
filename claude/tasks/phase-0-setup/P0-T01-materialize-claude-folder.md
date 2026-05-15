---
id: P0-T01
phase: 0
title: Materialize the claude/ folder
status: done
depends_on: []
estimate_hours: 2
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the project repo has a complete `claude/` folder that serves as the AI's persistent working memory across sessions. Every future task reads from this folder and updates it.

# Prerequisites (read first)

- The master plan: `~/.claude/plans/i-just-web-scraped-goofy-bubble.md`

# Files to touch

Create all of these:

- `claude/README.md`
- `claude/plans.md`
- `claude/progress.md`
- `claude/blockers.md`
- `claude/glossary.md`
- `claude/architecture/{overview,database-schema,design-system,auth-and-roles,caching-and-revalidation,search,image-pipeline,background-jobs,observability,security,ai-workflow}.md`
- `claude/decisions/ADR-{001,002,003,004,005,006,007,008,009}-*.md`
- `claude/runbooks/{launch-blockers.sql,seed-from-justkraft,promote-admin-user,deploy-vercel,rehost-images,restore-from-backup,rotate-secrets,add-new-migration,long-jobs-on-github-actions}.md`
- `claude/tasks/_template.md`
- `claude/tasks/phase-0-setup/P0-T{01..11}-*.md` (fully detailed)
- `claude/tasks/phase-1-foundation/P1-T{01..11}-*.md` (fully detailed)
- `claude/tasks/phase-2-admin/P2-T{00..29}-*.md` (frontmatter stubs only)
- `claude/tasks/phase-3-storefront/P3-T{00..23}-*.md` (frontmatter stubs only)
- `claude/tasks/phase-4-ai-and-polish/P4-T{00..12}-*.md` (frontmatter stubs only)
- `claude/tasks/phase-5-launch/P5-T{00..10}-*.md` (frontmatter stubs only)
- `claude/.local/` (empty, will be gitignored)

# Implementation notes

- Content for each file is specified in the master plan §"The `claude/` folder" and inline throughout. Architecture docs are the senior-eng reference material; ADRs follow the standard "Context → Decision → Consequences → Revisit trigger" shape.
- Phase 2–5 stubs include only frontmatter (`id`, `phase`, `title`, `status: not_started`, `depends_on`, `estimate_hours`, `owner`, `last_updated`) plus a single line: `Body to be written in P<N>-T00.`
- `.local/` is mentioned in `.gitignore` (added in P0-T10).

# Acceptance criteria

- [ ] All files listed above exist.
- [ ] `claude/plans.md` lists every Phase 0 + Phase 1 task with status ⬜ except this one (🟡).
- [ ] `claude/progress.md` shows current task as in-progress.
- [ ] Architecture docs internally cross-link (relative paths).
- [ ] No customer-facing copy invented.
- [ ] No code in `web/` touched (this task is purely additive in `claude/`).

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
# Count files (should be > 80)
find claude -type f | wc -l
# Verify no copy contains placeholder lorem ipsum
grep -ri "lorem ipsum" claude/ && echo "FAIL: placeholder copy found" || echo "OK: no placeholders"
# Verify task index in plans.md
grep -c "^- " claude/plans.md
```

# Dependencies added

None — pure documentation.

# Notes for next agent

**Folder materialized 2026-05-15.** Final file count: 100 markdown files + 1 SQL file + 1 task template = 102.

Structure delivered:
- `README.md`, `plans.md`, `progress.md`, `blockers.md`, `glossary.md` (5 root files)
- `architecture/` (11 reference docs — overview, database-schema, design-system, auth-and-roles, caching-and-revalidation, search, image-pipeline, background-jobs, observability, security, ai-workflow)
- `decisions/` (9 ADRs — 001 through 009)
- `runbooks/` (9 files — launch-blockers.sql, seed-from-justkraft, promote-admin-user, deploy-vercel, rehost-images, restore-from-backup, rotate-secrets, add-new-migration, long-jobs-on-github-actions)
- `tasks/_template.md` + 11 Phase 0 + 11 Phase 1 (fully detailed) + 78 Phase 2–5 stubs

Notable decisions made during materialization (no surprises, all in line with the master plan):
- `plans.md` uses ⬜/🟡/✅/🚧/⏸️ emoji status legend, mirrored to `progress.md`.
- Phase 2/3/4/5 task stubs include `depends_on` arrays so the dependency graph is correct from day one. Stub bodies are the same single line ("Body to be written in PX-T00…") and the entry task for each phase (PX-T00) expands them based on lessons learned.
- `.local/` is the gitignored AI-scratch dir; entry added to root `.gitignore` in P0-T10.

Next task: **P0-T02 — Archive old web/ to web-legacy/**. No blockers; runs without owner input.
