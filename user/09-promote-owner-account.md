# 📋 Promote your account to "owner"

After you sign up at `/login` (which lands in P2-T01), you'll exist in Supabase as a **`viewer`** — read-only. To actually use the admin panel, you need to be promoted to **`owner`**. This is a one-time SQL step.

There is **no "make me an admin" button** by design. Self-promotion would be a security hole — anyone who created an account could elevate themselves. The bootstrap owner is set once via SQL; from then on, additional admins/editors are added via a future team-settings UI.

---

## When to do this

After you have:
- Signed up at `https://<your-deploy>/login` with your real email + a password you remember.
- Seen the "Set up two-factor authentication" page (`/admin/2fa-setup`). You can stop there — the SQL below has to land before TOTP works.

If you haven't signed up yet, do that first. Come back to this page after.

---

## The 60-second procedure

1. Open the Supabase dashboard for the project: https://app.supabase.com → your project → **SQL Editor**.

2. Confirm your account exists in `auth.users`:

   ```sql
   SELECT u.id, u.email, p.role
   FROM auth.users u
   LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.email = '<your email>';
   ```

   You should see exactly one row, with `role = 'viewer'`. If `role` is `NULL`, the trigger that auto-creates profile rows didn't fire — stop and ping me; this is a P2-T02 regression.

3. Promote:

   ```sql
   UPDATE public.profiles
   SET role = 'owner', updated_at = now()
   WHERE id = (SELECT id FROM auth.users WHERE email = '<your email>');
   ```

   Should print `UPDATE 1`.

4. Sign out of the admin panel (top-right menu → Sign out) and sign back in. The session needs to refresh to pick up the new role.

5. Complete TOTP enrollment if you haven't already (you'll be redirected to `/admin/2fa-setup`). After verifying the 6-digit code, you'll land on `/admin`.

That's it. You're owner now.

---

## What "owner" lets you do (vs admin / editor)

- **owner** — everything, including creating and demoting other admins (Phase 5+ feature; for MVP nothing new beyond admin).
- **admin** — full catalog write access; cannot manage other admins.
- **editor** — same as admin in MVP. Reserved for narrower scope later.
- **viewer** — read-only, can see unpublished products but can't change anything.

For MVP it's just you, so "owner" is the right role.

---

## Promoting additional people later

Same SQL, different `role`:

```sql
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE id = (SELECT id FROM auth.users WHERE email = '<their email>');
```

Anyone you promote must first have signed up at `/login` themselves (you can't pre-create accounts for them in this flow — that's an invite-email feature deferred to a later phase).

---

## If something looks off

- **No row in step 2** — the user hasn't signed up yet, or signed up with a different email. Check `auth.users` without the WHERE clause.
- **Profile role is NULL** — trigger didn't fire. Re-run the P2-T02 test (`pnpm exec vitest run __tests__/auth/profiles-trigger.test.ts`); regression in the schema.
- **Signed in but `/admin` still redirects to `/login`** — your browser is holding the old (viewer) session. Hard-refresh, or clear cookies for the site.
- **`/admin/2fa-setup` keeps looping** — TOTP enroll didn't persist. Check `auth.mfa_factors` in the dashboard; if empty, the enroll RPC errored silently. Open an issue.

The runbook this is based on lives at [`claude/runbooks/promote-admin-user.md`](../claude/runbooks/promote-admin-user.md) if you need the deeper version.
