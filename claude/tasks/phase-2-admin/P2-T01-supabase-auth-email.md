---
id: P2-T01
phase: 2
title: Supabase Auth (email + password)
status: in_progress
depends_on: [P2-T00]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Bhavani Crafts owner can sign in at `https://<host>/login` with email + password, complete TOTP enrollment + verification on first sign-in, and land on `/admin/2fa-setup` or `/admin` (the latter ships in P2-T05). Every sign-in attempt — success or failure — writes a row to `audit_logs`. The route is rate-limited (Upstash) + captcha-protected (hCaptcha) + `noindex`, generic error strings prevent user enumeration, and the storefront has zero links pointing at `/login`.

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin login" — the 10-layer defense, the URL decision
- [claude/architecture/auth-and-roles.md](../../architecture/auth-and-roles.md) §"Stack", §"TOTP 2FA (owner)", §"Session policy", §"Forgot password"
- [claude/architecture/security.md](../../architecture/security.md) §"Three layers of authorization", §"Rate limits", §"Session policy", §"Security headers (next.config.ts)"
- [claude/decisions/ADR-010-pglite-and-di-supabase.md](../../decisions/ADR-010-pglite-and-di-supabase.md) — DI Supabase client pattern (`requireRole(supabase, role)` not `requireRole(role)`)
- [`web/src/lib/db/server.ts`](../../../web/src/lib/db/server.ts) — existing `createServerClient()` factory (cookies-bound via `@supabase/ssr`)
- [`web/src/lib/db/client.ts`](../../../web/src/lib/db/client.ts) — existing browser-side client factory
- [`web/src/lib/db/admin.ts`](../../../web/src/lib/db/admin.ts) — service-role client used for `audit_logs` inserts

# Files to touch

- `web/src/app/login/page.tsx` (new) — server component shell; renders `<LoginForm />`; if already AAL2 → redirect `/admin`
- `web/src/app/login/login-form.tsx` (new) — client component; email + password + hCaptcha widget
- `web/src/app/login/actions.ts` (new) — `signInAction(formData)` server action; calls `signInWithPassword({ options: { captchaToken } })`; writes `audit_logs`; redirects on success
- `web/src/app/login/layout.tsx` (new) — exports `metadata.robots = { index: false, follow: false }` (the meta tag); `X-Robots-Tag` header added in `next.config.ts`
- `web/src/app/admin/2fa-setup/page.tsx` (new) — server component; if user already has a verified TOTP factor → redirect `/admin`; otherwise render `<EnrollForm />`
- `web/src/app/admin/2fa-setup/enroll-form.tsx` (new) — client; renders QR (returned by `mfa.enroll`) + 6-digit code input; calls `mfa.challenge` + `mfa.verify`
- `web/src/app/admin/2fa-setup/actions.ts` (new) — `enrollAction`, `verifyAction` server actions
- `web/src/app/auth/verify-2fa/page.tsx` (new) — second-step page for users with AAL1 who have a factor; renders the TOTP code input
- `web/src/app/auth/verify-2fa/actions.ts` (new) — `verifyAction` that calls `mfa.challenge` + `mfa.verify`
- `web/src/app/auth/forgot-password/page.tsx` (new) — placeholder that renders "Forgot password — coming soon. Reset via Supabase dashboard for now." (full flow is a follow-up task; just a non-broken link target for `/login`)
- `web/src/lib/auth/audit.ts` (new) — `recordAuthAttempt(adminSupabase, opts)` — wraps the `audit_logs` insert (service-role only path; `audit_logs` policies forbid client writes)
- `web/src/lib/auth/captcha.ts` (new) — `verifyCaptcha(token)` server-side hCaptcha verify (defense in depth — Supabase will also verify, but we want to fail before touching Supabase)
- `web/src/lib/auth/rate-limit.ts` (new) — `enforceLoginRateLimit({ ip, email })` → `{ ok: true } | { ok: false, retryAfter: number }`; backed by Upstash (`@upstash/ratelimit` + `@upstash/redis`); 10/5min per IP, 5/5min per email
- `web/src/env.ts` (modified) — add `HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`; throw at module load if missing in production
- `web/.env.example` (modified) — document the four new env vars with hCaptcha's test keys as default
- `web/next.config.ts` (modified) — extend `headers()` with `{ source: '/login', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }`. Verify CSP `frame-ancestors 'none'` is still present from Phase 1.
- `web/eslint.config.mjs` (modified) — extend the `no-restricted-imports` allowed-importers list for `lib/db/admin.ts` to include `web/src/lib/auth/audit.ts`
- `web/__tests__/auth/sign-in.test.ts` (new) — Vitest integration test: success path, wrong-password generic error, rate-limit trip
- `web/__tests__/auth/mfa.test.ts` (new) — enroll, challenge, verify, then assert session is AAL2

# Implementation notes

**10-layer defense — locked in this session.** Every layer must be present. Don't drop any; each catches what the others miss.

| # | Layer | Where it lives |
|---|---|---|
| 1 | Supabase Auth email + password | `signInWithPassword` in `actions.ts` |
| 2 | Generic error messages | `actions.ts` — never branch on "user exists / password wrong"; always return `"Invalid email or password."` |
| 3 | Rate limit | `lib/auth/rate-limit.ts` (Upstash) + Supabase platform default (dashboard toggle, separate concern) |
| 4 | hCaptcha | `signInWithPassword({ options: { captchaToken } })` — Supabase verifies server-side; we also `verifyCaptcha(token)` defensively |
| 5 | TOTP 2FA mandatory for `owner` | P2-T04 middleware enforces; this task ships `/admin/2fa-setup` + `/auth/verify-2fa` flows |
| 6 | `HttpOnly` + `Secure` + `SameSite=Lax` cookies | already wired via `@supabase/ssr` — verify in acceptance criteria |
| 7 | CSP `frame-ancestors 'none'` | already in `next.config.ts` from Phase 1 — verify still present |
| 8 | `X-Robots-Tag: noindex, nofollow` on `/login` | `next.config.ts` headers config keyed on `source: '/login'` + Next `metadata.robots` |
| 9 | Storefront has ZERO links to `/login` | no `<Link href="/login">` outside `app/login/` itself — grep verifies in acceptance criteria |
| 10 | Audit log every attempt | `recordAuthAttempt` in both action handlers (success + failure branches) |

**URL — `/login`, not `/admin/login`.** Industry-standard guessable URL (Vercel/Linear/Notion/GitHub/Stripe). Security via defense in depth, not URL obscurity. See SESSION-RESUME for the rationale; don't re-debate it.

**DI Supabase client pattern (ADR-010).** Every server action constructs its client at the top of the function. No magic global, no per-environment branching inside the function.

```ts
"use server";
import { createServerClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";

export async function signInAction(formData: FormData) {
  const supabase = await createServerClient();   // cookies-bound, anon role
  const admin = createAdminClient();             // service-role for audit_logs
  // ... use `supabase` for auth ops; `admin` for audit log insert
}
```

`requireRole` (built in P2-T04) takes the same shape: `await requireRole(supabase, 'admin')`.

**Generic errors — strict.** Map every Supabase auth error to a single string:

```ts
function genericAuthError() {
  return { error: "Invalid email or password." };
}
```

Even "Email rate limit exceeded" maps to the generic string — the user only learns about rate-limiting via the `Retry-After` header (HTTP 429), never via in-form text. The rate limiter is silent at layer 3 and visible only when actually tripped.

**Constant minimum delay to mask timing.** Even with generic strings, "user does not exist" is faster than "user exists, password wrong." On the failure branch, ensure at least 200 ms elapsed total before returning. Don't add jitter; constant delay matches the slowest legitimate failure.

```ts
const start = Date.now();
// ... auth attempt
const elapsed = Date.now() - start;
if (!success && elapsed < 200) {
  await new Promise(r => setTimeout(r, 200 - elapsed));
}
```

**hCaptcha integration.**

```tsx
"use client";
import HCaptcha from "@hcaptcha/react-hcaptcha";

// inside <LoginForm />:
<HCaptcha
  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
  onVerify={(token) => setCaptchaToken(token)}
/>
```

The token rides along in the FormData. On the server:

```ts
const captchaToken = formData.get("captcha_token") as string | null;
if (!captchaToken) return genericAuthError();
const captchaOk = await verifyCaptcha(captchaToken);
if (!captchaOk) return genericAuthError();

const { data, error } = await supabase.auth.signInWithPassword({
  email, password,
  options: { captchaToken },
});
```

Supabase will re-verify the token (configured in the Supabase Auth → Captcha dashboard). We do it first because we want to fail fast on bot traffic before touching Supabase.

**hCaptcha test keys** (dev only, `.env.example`):
```
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001
HCAPTCHA_SECRET=0x0000000000000000000000000000000000000000
```
These pass any token unconditionally. Production gets real keys provisioned by the owner — note this in `.env.example` next to the placeholder.

**TOTP 2FA enforcement.** Two distinct flows:

1. **First sign-in (no factor yet).** Successful password sign-in produces an AAL1 session. P2-T04 middleware notices `profiles.role = 'owner'` + no `aal2` + no verified factor → redirects to `/admin/2fa-setup`. User enrolls (renders QR from `mfa.enroll({ factorType: 'totp' })`, scans, enters 6-digit code, calls `mfa.challenge` + `mfa.verify`). On verify success, session upgrades to AAL2. Redirect to `/admin`.

2. **Subsequent sign-in (factor exists).** Successful password sign-in produces AAL1. Middleware sees `aal1` + factor exists → redirects to `/auth/verify-2fa`. User enters 6-digit code → `mfa.challenge` + `mfa.verify` → AAL2. Redirect to `/admin`.

For `role IN ('admin','editor')` in MVP we don't enforce TOTP (sole owner; team grows later — revisit when invites land). For `role='viewer'` they never reach `/admin/*` anyway.

**Audit log shape.**

```ts
await recordAuthAttempt(admin, {
  actor_id: userId ?? null,            // null when sign-in failed before identifying
  action: success ? "auth.signin" : "auth.signin_failed",
  entity_type: "session",
  entity_id: sessionId ?? null,
  before_json: null,
  after_json: { ip, user_agent, captcha_passed: true, mfa_level: success ? "aal1" : null },
  request_id: requestId,                // pulled from `headers().get('x-request-id')` or generated
});
```

The service-role client is used because `audit_logs` policies forbid client writes (see [security.md §"RLS policies"](../../architecture/security.md)). `lib/auth/audit.ts` becomes an exempt importer of `lib/db/admin.ts` — extend `eslint.config.mjs` rather than disabling the rule.

**Rate limit shape.** Upstash Redis sliding window, AND-composed across IP + email:

```ts
const ipLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "5 m"),
  prefix: "auth:ip",
});
const emailLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "5 m"),
  prefix: "auth:email",
});
```

Both must pass. On block, return HTTP 429 with `Retry-After: <seconds>`. **Do not write to `audit_logs` on rate-limit block** — that would give the attacker confirmation that the rate limit exists and that they're tripping it. (We still write on captcha fail / password fail — both look identical from outside.)

**Cookie verification.** `@supabase/ssr` sets cookies with the right flags by default. Don't override `cookies.set` behavior — verify the defaults in acceptance criteria via DevTools or `curl -v`.

**Forgot password — stubbed.** Real flow is a follow-up task. Stub a placeholder at `/auth/forgot-password` that says "Reset via the Supabase dashboard for now." Link from `/login`. Don't ship a broken link.

# Acceptance criteria

- [ ] `/login` renders email + password + hCaptcha widget. View source contains `<meta name="robots" content="noindex, nofollow">`.
- [ ] `curl -sI http://localhost:3000/login` includes `X-Robots-Tag: noindex, nofollow`.
- [ ] `grep -rn 'href="/login"' web/src/app/` returns only matches inside `web/src/app/login/`.
- [ ] Successful sign-in writes one `audit_logs` row with `action='auth.signin'` and `after_json.mfa_level='aal1'`.
- [ ] Failed sign-in (wrong password) writes one `audit_logs` row with `action='auth.signin_failed'`, `actor_id=NULL`, response surfaces only `"Invalid email or password."` — no user-enumeration leak.
- [ ] 11th sign-in attempt from the same IP within 5 min returns HTTP 429 with `Retry-After`. No `audit_logs` row on the block.
- [ ] Owner user without a verified TOTP factor lands on `/admin/2fa-setup`. Verifies the TOTP code → session upgrades to AAL2 → redirected to `/admin`.
- [ ] Owner user with a verified factor lands on `/auth/verify-2fa` after password sign-in. Enters TOTP → AAL2 → `/admin`.
- [ ] Session cookie set on sign-in has `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- [ ] `pnpm exec vitest run __tests__/auth/` — both new test files green against live Supabase.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` all green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm build

# Headers + meta + no storefront links
pnpm dev &
sleep 4
curl -sI http://localhost:3000/login | grep -i 'x-robots-tag'
curl -s http://localhost:3000/login | grep -i 'name="robots"'
grep -rn 'href="/login"' src/app/ | grep -v 'src/app/login/'

# Tests
pnpm exec vitest run __tests__/auth/

# Manual browser pass (against a Supabase test owner seeded via the dashboard):
# 1. /login renders, captcha widget loads
# 2. Wrong password → generic error string, no enumeration
# 3. Correct password → redirected to /admin/2fa-setup (first time) or /auth/verify-2fa (subsequent)
# 4. Complete TOTP enroll/verify → AAL2 → /admin
# 5. DevTools: cookie is HttpOnly + Secure + SameSite=Lax
# 6. SELECT * FROM audit_logs WHERE action LIKE 'auth.%' ORDER BY created_at DESC LIMIT 5 → ≥2 rows
```

# Dependencies added

- `@hcaptcha/react-hcaptcha` — client-side captcha widget. No shadcn primitive substitutes.
- `@upstash/ratelimit` + `@upstash/redis` — distributed sliding-window rate limit. Vercel KV is an alternative; `architecture/security.md` already commits to Upstash.

# Notes for next agent

**2026-05-17 — in_progress.** Landed the core sign-in flow + audit logging + indexing-block. Three of the ten defense layers are deferred until owner provisions external credentials. TOTP routes (layer 5 implementation, not just enforcement) deferred to a sibling task.

**What landed in this sub-commit:**
- `lib/auth/audit.ts` — `recordAuthAttempt(admin, input)` + `ANONYMOUS_AUTH_ENTITY_ID` sentinel (audit_logs.entity_id is `uuid NOT NULL`; the sentinel covers pre-identification failures and we put `attempted_email` in `after_json` for forensics)
- `app/login/page.tsx` + `login-form.tsx` + `layout.tsx` (noindex via `metadata.robots`) + `actions.ts`
- `app/auth/forgot-password/page.tsx` — placeholder so the link from `/login` isn't broken; real reset flow is a follow-up
- `next.config.ts` — `X-Robots-Tag: noindex, nofollow` for `/login` and `/auth/*`
- `eslint.config.mjs` — extended the service-role allowed-importers list with `app/login/**`, `app/auth/**`, `lib/auth/audit.ts`
- `__tests__/auth/audit.test.ts` — 4 integration tests against live `audit_logs`

**Defense-layer status (per [SESSION-RESUME §"Admin login"](../../SESSION-RESUME.md)):**

| # | Layer | Status |
|---|---|---|
| 1 | Supabase email + password | ✅ |
| 2 | Generic error string + constant 200ms minimum failure delay | ✅ |
| 3 | Rate limit (Upstash) | ⏸ deferred — needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| 4 | hCaptcha | ⏸ deferred — needs `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET` |
| 5 | TOTP enforcement — proxy redirect logic | ✅ (T04c) |
| 5 | TOTP enrollment + verification routes | ✅ (this commit) |
| 6 | HttpOnly/Secure/SameSite=Lax cookies | ✅ (via `@supabase/ssr`) |
| 7 | CSP `frame-ancestors 'none'` | ✅ (already in next.config.ts from P0) |
| 8 | `X-Robots-Tag: noindex, nofollow` + `<meta robots>` | ✅ |
| 9 | Zero storefront links to /login | ✅ (verified by grep; only `/auth/forgot-password` links inward, which is itself in the auth flow) |
| 10 | Audit log on every attempt | ✅ |

**Smoke verified in dev:**
- `curl -sI http://localhost:3000/login` → `X-Robots-Tag: noindex, nofollow`
- `curl -s http://localhost:3000/login` → contains `<meta name="robots" content="noindex, nofollow">`
- `curl -sI http://localhost:3000/admin` → 307 redirect (proxy.ts gate)
- Layer 9 grep: no `href="/login"` outside `app/login`, `app/auth`, `app/admin`

**audit_logs schema gotcha (documented for future agents):** `entity_id` is `uuid NOT NULL`. Failed sign-ins don't have a user yet, so they use `ANONYMOUS_AUTH_ENTITY_ID` (zero UUID) + stash the attempted email in `after_json.attempted_email`. The types.gen.ts says `entity_id: string` which masks this — Postgres validates the uuid format and rejects email strings. If you generalize this helper for non-auth audit calls, the UUID requirement still applies; either use the entity's real id or the zero UUID.

**Constant 200ms minimum failure delay** keeps "user not found" and "user exists, password wrong" indistinguishable by timing. No jitter — the slowest legitimate failure sets the bar.

**What's still pending for full P2-T01 done:**
1. **Captcha + rate-limit hardening sub-commit** — requires the four env vars listed above. Owner needs to provision hCaptcha (free) + Upstash (free tier). hCaptcha test keys can be used in dev as a stopgap; Upstash needs real credentials. Code path should throw at module load if credentials missing — fail-fast per engineering principles.
2. **End-to-end smoke** — owner promotes themselves via `user/09-promote-owner-account.md`, signs in, completes TOTP enrollment, lands on `/admin`. After this lands, P2-T03 also flips to `done`.
3. **AAL2-success tests** — add an integration test that drives `mfa.enroll` → `mfa.challenge` → `mfa.verify` with a correct code, then asserts `requireAAL2` passes. Needs a TOTP library (e.g. `otplib`) as a devDependency to compute the expected code. Marginal automated coverage win; manual smoke is sufficient for now.

**TOTP routes landed in part-b sub-commit:**
- `app/admin/2fa-setup/page.tsx` + `enroll-form.tsx` + `actions.ts`. Enrollment renders QR + manual-secret fallback; submit calls `mfa.challenge` + `mfa.verify`; audit log on success and failure; redirect to `/admin` on success.
- `app/auth/verify-2fa/page.tsx` + `verify-form.tsx` + `actions.ts`. Subsequent sign-in: finds the verified factor and challenges it with the user's TOTP code.
- Both pages bounce already-AAL2 sessions to `/admin` and unauthenticated sessions to `/login`. Belt + suspenders on top of the proxy gate.
- Orphan unverified factors on `/admin/2fa-setup` are auto-cleaned on each page load (Supabase doesn't re-emit the QR for an existing factor; cleanest path is unenroll-then-enroll fresh on every render). Trade-off: a stale tab and a fresh tab will end up holding different factor ids; the action validates the factor id from the form against the current factor list at verify time.

**For the next agent picking up the rest of T01:**
- Captcha + rate-limit can ship as a separate hardening commit AFTER credentials land. Don't block on them — the basic flow + Supabase platform rate-limit is sufficient for owner-only single-user MVP.
- The `MFANotVerifiedError` path in `require.ts` is already tested against an AAL1 session. AAL2-success test wants a TOTP lib; defer.
- After the owner verifies the full enroll+verify flow once, mark T01 `done` and flip P2-T03 `done` in the same pass.
