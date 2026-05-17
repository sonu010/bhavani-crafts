---
id: P2-T03
phase: 2
title: Promote owner runbook (verified end-to-end)
status: in_progress
depends_on: [P2-T02]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the owner can promote a freshly-signed-up account to `role='owner'` and confirm AAL2 + admin access using a runbook that has been executed end-to-end at least once against a live (or stage) Supabase project. The runbook lives at `claude/runbooks/promote-admin-user.md` and is referenced from `architecture/auth-and-roles.md`, `SESSION-RESUME.md`, and `user/06-promote-owner-account.md`.

# Prerequisites (read first)

- [claude/architecture/auth-and-roles.md](../../architecture/auth-and-roles.md) §"Roles" + §"TOTP 2FA (owner)"
- [claude/tasks/phase-2-admin/P2-T01-supabase-auth-email.md](P2-T01-supabase-auth-email.md) — the auth flow this runbook complements
- [claude/tasks/phase-2-admin/P2-T02-profiles-table-and-trigger.md](P2-T02-profiles-table-and-trigger.md) — the trigger contract this runbook depends on

# Files to touch

- `claude/runbooks/promote-admin-user.md` (modified or new) — the verified runbook
- `user/09-promote-owner-account.md` (new) — owner-facing one-pager that links into the runbook with hand-holding screenshots/labels (slot `06-` was already taken by an earlier owner doc)

# Implementation notes

This is a docs + manual-execution task. Engineering-principles call: "smallest effective change" — don't build admin tooling for what is fundamentally a one-time SQL update.

**Runbook sections (in order):**

1. **Prerequisites.** Owner has signed up at `/login` (P2-T01) and has access to the Supabase project dashboard with a database-role login.
2. **Step 1 — confirm the auth.users row exists.** SQL Editor: `SELECT id, email, created_at FROM auth.users WHERE email = '<owner email>';` → exactly one row.
3. **Step 2 — confirm the profiles row was auto-created.** SQL Editor: `SELECT id, role FROM public.profiles WHERE id = '<id from step 1>';` → exactly one row with `role='viewer'`. If zero rows, the trigger failed silently — re-run P2-T02 test before promoting.
4. **Step 3 — promote.** `UPDATE public.profiles SET role = 'owner', updated_at = now() WHERE id = '<id>';` → confirm `UPDATE 1`.
5. **Step 4 — verify.** Sign in to `/login`, complete TOTP enrollment (first time) → land on `/admin`. Hit `/api/admin/whoami` (lightweight echo route — add as part of this task if not present) → response shows `{ role: 'owner', aal: 'aal2' }`.
6. **Step 5 — audit log.** `SELECT * FROM audit_logs WHERE actor_id = '<id>' ORDER BY created_at DESC LIMIT 3;` → expect `auth.signin`, `auth.mfa_verify_succeeded` (or equivalent shape from P2-T01).

**Execute the runbook against the live Supabase project once before marking this task done.** Document the actual SQL output observed (anonymized — never paste real emails or UUIDs into the repo).

**The lightweight `/api/admin/whoami` route** — useful for verification, not strictly required. If it adds complexity, defer to P2-T05 (admin shell) where the user menu already needs role information.

# Acceptance criteria

- [ ] `claude/runbooks/promote-admin-user.md` exists with the five-step procedure.
- [ ] `user/06-promote-owner-account.md` exists and links into the runbook in owner-friendly language.
- [ ] The runbook has been executed end-to-end against at least one Supabase project; the "Notes for next agent" section records the actual UUID-prefix + timestamp of the verification run (anonymized).
- [ ] `architecture/auth-and-roles.md` line 22 already links to the runbook — verify the link resolves.

# Verification

```bash
# Markdown link check
grep -rn '(promote-admin-user' claude/ user/ | sort
# Every match should resolve to an existing file path
```

The real verification is human: sign up a test account, run the SQL, sign back in, land on `/admin` with AAL2.

# Dependencies added

None.

# Notes for next agent

**2026-05-17 — in_progress.** Doc deliverables landed; end-to-end browser verification is deferred until P2-T01 ships the actual sign-in flow.

**What landed:**
- `claude/runbooks/promote-admin-user.md` already existed from an earlier phase and matches the procedure. No edits needed.
- `user/09-promote-owner-account.md` (this task) — owner-facing one-pager with the 60-second SQL procedure, role-table reference, and a troubleshooting checklist for the most-likely failure modes (no row, NULL role, stale cookie, TOTP loop).

**Why `09-` and not `06-`:** the `user/` directory was numbered 00–08 before this task. The expanded P2-T00 referenced `06-promote-owner-account.md` from memory; in reality slot `06` is `06-next-steps-vercel-and-supabase.md`. Used the next free slot.

**SQL portion already proven by P2-T02.** The runbook's load-bearing step is `UPDATE public.profiles SET role = 'owner' WHERE id = ...`. The P2-T02 test exercises the same UPDATE shape via service-role and confirms `profiles.role` flips + `is_admin()` returns the new role. So the SQL itself is verified — what isn't yet is the *owner's* browser flow (sign in → land on /admin/2fa-setup → enroll TOTP → land on /admin). That sequence needs T01 + T04 + T05 to exist before the owner can run it.

**Flip to `done` when:** the owner has executed the runbook against the live project once after T01 ships and confirmed they land on `/admin` with role=owner and AAL2. Capture the verification timestamp (anonymized — no email) in this section before flipping.
