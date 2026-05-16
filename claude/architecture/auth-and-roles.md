# Auth and roles

## Stack

- **Supabase Auth** — email + password is the MVP method. Magic-link can be enabled later without schema change.
- **`@supabase/ssr`** for server-side cookie-based auth in Next.js App Router (NOT `@supabase/auth-helpers-nextjs`, which is deprecated).
- **`profiles` table** holds the role; `auth.users` is never queried directly from the client.
- **TOTP 2FA** required for the owner's admin account from day one (Supabase Auth supports it via the `mfa` flow).

## Roles

Defined in the `profile_role` enum:

| Role | Read | Write catalog | Manage users | Notes |
|---|---|---|---|---|
| `owner` | all (incl. unpublished) | yes | yes | The Bhavani Crafts owner. Exactly one expected. |
| `admin` | all | yes | no | Staff with full catalog write. |
| `editor` | all | yes | no | Same as admin in MVP. Reserved for narrower scope later. |
| `viewer` | all (incl. unpublished) | no | no | Read-only staff. Useful for tax/accounting later. |
| (no profile) | public-RLS only | no | no | Anonymous storefront visitors. |

A row in `profiles` is created automatically by a trigger when `auth.users` gets a new row. Default `role = 'viewer'`. The owner promotes the first account to `owner` via SQL on first login. See [runbook: promote-admin-user](../runbooks/promote-admin-user.md).

## Three layers of authorization

We never trust one layer alone.

1. **Middleware (Edge)** — `web/src/middleware.ts`. Redirects any `/admin/*` request without a session cookie to `/login`. Cheap filter; not authorization.
2. **Server-side authz** — Every server action's first line is `await requireRole(supabase, 'admin')`. Helper in `web/src/lib/auth/require.ts` reads the cookie, fetches the profile, checks the role. Throws `403` if missing. **This is the real gate.** The Supabase client is passed in as the first arg per the dependency-injection pattern (see [testing-and-ci.md](testing-and-ci.md) and [ADR-010](../decisions/ADR-010-pglite-and-di-supabase.md)); `requireRole` doesn't construct its own.
3. **RLS** — Postgres policies are the last line of defense. Even if the server-side check were skipped, RLS would prevent anon/viewer accounts from writing.

## Session policy

- Session length: 24 hours of activity, then refresh; hard expire at 7 days. Set via Supabase Auth dashboard.
- Idle timeout: client-side logout if no interaction for 4 hours on `/admin/*`. Refresh extends.
- Cookie attributes: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Set by `@supabase/ssr`.
- Sign-out invalidates the refresh token server-side via `supabase.auth.signOut({ scope: 'global' })`.

## TOTP 2FA (owner)

- Owner enrolls a TOTP factor on first login via `supabase.auth.mfa.enroll({ factorType: 'totp' })`.
- A signed-in user without a verified TOTP factor lands on `/admin/2fa-setup` instead of the admin shell.
- Admin sessions store `aal2` (AuthAssurance Level 2). Middleware requires `aal2` on `/admin/*` — `aal1` (password-only) is redirected to TOTP verification.

## Forgot password

- "Forgot password?" link on `/login` → `supabase.auth.resetPasswordForEmail(email)`.
- Email sent via Resend (when configured); Supabase's built-in SMTP works as a stopgap.
- Reset link lands on `/auth/reset-password`, which calls `supabase.auth.updateUser({ password })`.

## Future (NOT in MVP)

- Customer-facing auth (Google OAuth or email magic link) — added in Phase 5+ when accounts/orders ship.
- Admin invite emails for new editors — added when team grows beyond owner.
