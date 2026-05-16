---
id: P2-T03
phase: 2
title: Promote owner runbook (verified end-to-end)
status: not_started
depends_on: [P2-T02]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-16
---

# Goal

After this task, the owner can promote a freshly-signed-up account to `role='owner'` and confirm AAL2 + admin access using a runbook that has been executed end-to-end at least once against a live (or stage) Supabase project. The runbook lives at `claude/runbooks/promote-admin-user.md` and is referenced from `architecture/auth-and-roles.md`, `SESSION-RESUME.md`, and `user/06-promote-owner-account.md`.

# Prerequisites (read first)

- [claude/architecture/auth-and-roles.md](../../architecture/auth-and-roles.md) §"Roles" + §"TOTP 2FA (owner)"
- [claude/tasks/phase-2-admin/P2-T01-supabase-auth-email.md](P2-T01-supabase-auth-email.md) — the auth flow this runbook complements
- [claude/tasks/phase-2-admin/P2-T02-profiles-table-and-trigger.md](P2-T02-profiles-table-and-trigger.md) — the trigger contract this runbook depends on

# Files to touch

- `claude/runbooks/promote-admin-user.md` (modified or new) — the verified runbook
- `user/06-promote-owner-account.md` (new) — owner-facing one-pager that links into the runbook with hand-holding screenshots/labels

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

(empty)
