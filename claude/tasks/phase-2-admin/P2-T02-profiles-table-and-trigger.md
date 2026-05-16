---
id: P2-T02
phase: 2
title: profiles table + sign-up trigger
status: not_started
depends_on: [P2-T01]
estimate_hours: 1
owner: ai
last_updated: 2026-05-16
---

# Goal

After this task, we have a Vitest integration test that proves the existing `public.profiles` table + `on_auth_user_created` trigger work end-to-end: a fresh `supabase.auth.admin.createUser()` call produces exactly one `profiles` row with `role='viewer'`, the foreign key cascades on user deletion, and `public.is_admin()` returns the correct boolean for both roles. No schema change — only verification + documentation.

# Prerequisites (read first)

- [claude/architecture/auth-and-roles.md](../../architecture/auth-and-roles.md) §"Roles" — the four roles + the auto-trigger contract
- [`web/supabase/migrations/0001_init.sql`](../../../web/supabase/migrations/0001_init.sql) §"4. profiles" + §"5. Helper functions" — the table, the `handle_new_user()` trigger function, the `is_admin()` helper. All three already exist.
- [claude/decisions/ADR-010-pglite-and-di-supabase.md](../../decisions/ADR-010-pglite-and-di-supabase.md) — DI Supabase client pattern (test uses a service-role client injected at the call site)
- [`web/__tests__/db/_clients.ts`](../../../web/__tests__/db/_clients.ts) — shared test client factories (anon + service-role)

# Files to touch

- `web/__tests__/auth/profiles-trigger.test.ts` (new) — three integration tests against live Supabase
- `claude/runbooks/promote-admin-user.md` (modified or new — check first; the file is referenced from `architecture/auth-and-roles.md` line 22 and from P2-T03)

No SQL migration. No new tables. The schema is already correct; this task verifies the contract holds.

# Implementation notes

The `profiles` row is the source of truth for admin role checks; the trigger is the only thing that keeps it in sync with `auth.users`. If the trigger silently no-ops (e.g., RLS misconfiguration, search-path drift, function-signature change), a newly signed-up user gets a session but no profile — and every downstream `requireRole` check throws 403. The cost of that silent failure is high enough to justify a permanent test, even though the contract is "obvious" from reading the migration.

**Three assertions in the test:**

1. **Auto-creation.** Use a service-role client to call `supabase.auth.admin.createUser({ email: 'zzz-fixture-<rand>@bhavani.test', email_confirm: true })`. Then `SELECT * FROM profiles WHERE id = <user.id>` returns exactly one row with `role='viewer'`, `full_name IS NULL`, `created_at` within the last 5 seconds.

2. **Cascade delete.** `supabase.auth.admin.deleteUser(user.id)`. Then the same `SELECT` returns zero rows (FK `ON DELETE CASCADE` doing its job).

3. **`is_admin()` correctness.** With the test user still as `viewer`, an authenticated client bearing that user's JWT calls `SELECT public.is_admin()` → returns `false`. Promote via service-role `UPDATE profiles SET role = 'admin' WHERE id = ...` → re-call as the same JWT → returns `true`. This tests both the role gate and the `STABLE` + `SECURITY DEFINER` posture.

**DI Supabase client pattern.** The test takes service-role and JWT-bearing clients as parameters; it does not import a singleton. Reuse `__tests__/db/_clients.ts` if it exposes a service-role factory; otherwise add one alongside the existing anon factory. Test fixtures use `zzz-`-prefixed emails so they sort last and a stale fixture is trivially queryable.

**Runbook check.** [claude/runbooks/promote-admin-user.md](../../runbooks/promote-admin-user.md) is referenced from `architecture/auth-and-roles.md` line 22 and from P2-T03. If the file does not yet exist, write a 5–10 line runbook here: log into Supabase SQL Editor → run `UPDATE public.profiles SET role='owner' WHERE id = (SELECT id FROM auth.users WHERE email = '<owner email>');` → confirm `SELECT role FROM public.profiles WHERE id = ...` returns `owner`. P2-T03 expands this into a verified end-to-end runbook.

# Acceptance criteria

- [ ] `web/__tests__/auth/profiles-trigger.test.ts` passes against live Supabase. Three cases: auto-creation, cascade delete, `is_admin()` correctness.
- [ ] Test fixtures use `zzz-`-prefixed emails and clean themselves up in `afterAll`.
- [ ] `pnpm exec vitest run __tests__/auth/profiles-trigger.test.ts` exits 0.
- [ ] `pnpm tsc --noEmit`, `pnpm lint` green.
- [ ] If `claude/runbooks/promote-admin-user.md` did not exist before this task, it does now and contains the SQL one-liner.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/auth/profiles-trigger.test.ts
pnpm tsc --noEmit
pnpm lint

# After the test passes, confirm no stale fixtures left behind:
psql "$DB_URL" -c "SELECT count(*) FROM auth.users WHERE email LIKE 'zzz-fixture-%@bhavani.test';"
# Expect: 0
```

# Dependencies added

None.

# Notes for next agent

(empty)
