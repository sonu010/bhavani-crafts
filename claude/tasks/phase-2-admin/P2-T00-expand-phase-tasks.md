---
id: P2-T00
phase: 2
title: Expand Phase 2 task files
status: done
depends_on: [P1-T11]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the 29 Phase 2 stubs (P2-T01 through P2-T29) have full task bodies — Goal, Prerequisites, Files to touch, Implementation notes, Acceptance criteria, Verification, Dependencies — with the Phase 2 design decisions just locked in `SESSION-RESUME.md` baked into the relevant tasks (login URL, 10-layer defense, default products filter, mobile drawer shape, 2×3 dashboard grid, admin nav tree). Implementer of any P2-T0N can pick up the file and ship without re-deciding architecture.

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) — locked Phase 2 design decisions
- [claude/tasks/_template.md](../_template.md) — section contract
- [claude/tasks/phase-1-foundation/P1-T09-typed-data-layer.md](../phase-1-foundation/P1-T09-typed-data-layer.md) — compact format reference
- [claude/tasks/phase-1-foundation/P1-T01-migration-core-tables.md](../phase-1-foundation/P1-T01-migration-core-tables.md) — expansive format reference

# Files to touch

29 task files in `claude/tasks/phase-2-admin/` (P2-T01 through P2-T29) — all currently stubs with `# Goal` and `# Notes for next agent` only. Expansion is mixed-by-complexity:

**Expansive (7 tasks)** — load-bearing architecture cited verbatim:
- P2-T01 — Supabase Auth + `/login` (10-layer defense, TOTP, hCaptcha)
- P2-T04 — Middleware + `requireRole` (three-layer authz, `/design` RSC fix)
- P2-T15 — Image upload (`file-type` sniff, 5 MB / 4000² caps, EXIF strip)
- P2-T23 / T24 / T25 — CSV import pipeline (background_jobs worker, checkpoint resume)
- P2-T28 — Soft-delete trash (ADR-006 verbatim, hard-delete typed-confirmation)

**Compact (22 tasks)** — reference locked patterns by section. T02, T03, T05–T14, T16–T22, T26, T27, T29.

`claude/plans.md` is updated only if `depends_on` or `title` drifts during expansion (none expected; the dependency graph in the stubs is already correct).

# Implementation notes

**Format contract.** Every expanded file must have all eight sections from `_template.md`: Goal, Prerequisites (read first), Files to touch, Implementation notes, Acceptance criteria, Verification, Dependencies added, Notes for next agent. Section headers are `#` (h1) — `_template.md` uses h1 throughout and the verification grep matches on exact strings.

**Frontmatter discipline.** Preserve `id`, `phase`, `title`, `depends_on`, `estimate_hours`, `owner` from the stub (those were already locked when the stubs were created and the filename slugs match the titles). Update `last_updated: 2026-05-16`. Keep `status: not_started` — the expanded files describe work that hasn't started, only their docs landed.

**Cross-cutting patterns cited per task, never restated:**

1. DI Supabase client (every fn `supabase: SupabaseClient<Database>` first arg) — ADR-010.
2. Soft delete (`deleted_at`/`deleted_by`, never `DELETE FROM`) — ADR-006.
3. Audit log on every admin mutation via service-role.
4. RLS EXISTS subquery pattern for child tables — `architecture/security.md` §"RLS policies".
5. Service-role isolation — only `lib/db/admin.ts` imports `SUPABASE_SERVICE_ROLE_KEY`; ESLint enforces.
6. pglite-before-push for any migration — ADR-010.
7. `revalidateTag()` / `revalidatePath()` after every catalog mutation — `architecture/caching-and-revalidation.md`.
8. Design tokens locked — 11 colors, Newsreader + Manrope + JetBrains Mono only.
9. Targeted `git add <paths>` — never `-A`.

Each task's "Prerequisites (read first)" section links to the relevant architecture doc / ADR. Implementation notes only call out the deviation or task-specific application.

**Two commits, both on `rebuild-v2` in the parent repo (NOT in the worktree this session opened in — the worktree is on a legacy `main`-derived branch with no Phase 2 files):**

- Commit 1 — auth foundation (T01–T04): `docs(p2): expand auth + middleware task files (T01-T04)`.
- Commit 2 — admin surface (T05–T29) + P2-T00 marked `done`: `docs(p2): expand admin shell + product + ops task files (T05-T29)`.

# Acceptance criteria

- [ ] All 29 files have an expanded body (no `(Body to be written in P2-T00…)` placeholder remains).
- [ ] Every file has all eight template sections.
- [ ] Frontmatter `last_updated: 2026-05-16` on every file.
- [ ] `depends_on` graph still resolves (every referenced task id is a file that exists).
- [ ] Two commits land on `rebuild-v2` with targeted `git add` (no `-A`).
- [ ] `P2-T00` itself is marked `status: done` in commit 2.

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"

# Frontmatter sanity — every file has the 8 required keys
for f in claude/tasks/phase-2-admin/P2-T*.md; do
  for key in id phase title status depends_on estimate_hours owner last_updated; do
    grep -q "^${key}:" "$f" || echo "MISSING $key in $f"
  done
done

# Every depends_on target exists
grep -h "^depends_on:" claude/tasks/phase-2-admin/P2-T*.md | tr -d '[]" ' | tr ',' '\n' | sort -u | while read dep; do
  [ -z "$dep" ] && continue
  ls claude/tasks/*/${dep}-*.md >/dev/null 2>&1 || echo "BROKEN DEP: $dep"
done

# No file still contains the stub placeholder (this task self-references the
# placeholder phrase in its own grep command, so we exclude P2-T00 itself).
grep -l "Body to be written in P2-T00 once Phase 2 kicks off" \
  claude/tasks/phase-2-admin/P2-T*.md \
  | grep -v 'P2-T00-' \
  && echo "STUB REMAINS"

# Every expanded file has all template sections
for f in claude/tasks/phase-2-admin/P2-T*.md; do
  for section in "# Goal" "# Prerequisites" "# Files to touch" "# Implementation notes" "# Acceptance criteria" "# Verification" "# Notes for next agent"; do
    grep -qF "$section" "$f" || echo "MISSING $section in $f"
  done
done

# P2-T00 marked done, all others not_started
grep "^status:" claude/tasks/phase-2-admin/P2-T*.md
```

# Dependencies added

None.

# Notes for next agent

**2026-05-17 — DONE.** Two commits on `rebuild-v2`:
- `33b5477` — auth foundation (T01–T04) + P2-T00 in_progress
- this commit — admin surface (T05–T29) + P2-T00 done

**Mixed-by-complexity depth landed as planned:**
- Expansive (7 tasks, ~200–300 lines each): T01, T04, T15, T23, T24, T25, T28
- Compact (22 tasks, ~80–170 lines each): everything else

**Locked decisions baked in (cite-able from each task):**
- T01: full 10-layer defense table at the top; hCaptcha test keys + Upstash sliding window + TOTP enrollment/verify split into `/admin/2fa-setup` and `/auth/verify-2fa`
- T04: three-layer authz example code (middleware shape + `requireRole` body); `/design` RSC payload leak fix folded in
- T05: navigation tree verbatim from SESSION-RESUME; Sheet drawer locked
- T06: 2×3 widget ASCII grid verbatim + "no rev/customer/conversion" rationale
- T07: `DEFAULT_STATUS = 'needs_review'` hard-coded constant with the "flip when < 50" note
- T09: ADR-006 bulk-soft-only constraint enforced
- T15: full security.md §"File-upload validation" enumeration; HEIC supported; license_status default `unverified` linked to the launch-blockers check
- T23/24/25: import_runs + import_run_rows staging → background_jobs worker with checkpoint resume → report with errors CSV download
- T28: ADR-006 read-out at the top; typed-confirmation modal mock; no bulk-hard-delete path
- T29: 360px audit covers every page from T05–T28

**Cross-cutting patterns referenced by section (not restated) in every task:**
- DI Supabase client (ADR-010)
- Soft delete (ADR-006)
- Audit log via service-role
- RLS EXISTS pattern
- Service-role isolation
- pglite-before-push
- `revalidateTag`/`revalidatePath` per the mutation map
- Design tokens (11 colors, three font families)
- Targeted `git add`

**`plans.md` not modified.** The depends_on graph and titles in the stubs were correct; no drift to sync. Per agreed scope.

**Migrations the implementer may need to add as Phase 2 progresses** (flagged inside the task files, validate via pglite first):
- 0008 partial-unique index for `product_variants.is_default` (T14)
- 0009 `tags.deleted_at` if not already present + `merge_tags` RPC (T21)
- 0010 `import_run_rows.applied_product_id` (T25)
- 0011 audit_logs index `(created_at DESC, id DESC)` if missing (T26)

**First buildable task is now P2-T01 (Supabase Auth + `/login`).** It depends on P2-T00 only, which is `done`. P2-T02 unblocks T03 + T04; T04 unblocks T05; T05 fans out to everything.

**Two notes for whoever picks up T01 first:**
1. The Upstash + hCaptcha env vars are listed in `files to touch` but the owner has not provisioned them yet — flag a credential block on T01 if production secrets aren't available.
2. The TOTP enrollment flow lives at `/admin/2fa-setup` — that route is inside `/admin/*` which middleware (T04) gates. There's a chicken-and-egg: an AAL1 session needs to reach the 2fa-setup page. Solution baked into T04: middleware redirects AAL1 sessions to `/admin/2fa-setup` (not blocks them); the page itself is accessible at AAL1.
