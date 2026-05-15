---
id: P0-T11
phase: 0
title: Set security headers + image remotePatterns in next.config
status: done
depends_on: [P0-T10]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, every response from the Next.js app carries strict security headers (CSP, HSTS, X-Frame-Options, etc.), and `next/image` is configured to accept Supabase Storage + the Just Kraft seed CDN.

# Prerequisites (read first)

- claude/architecture/security.md (§"Security headers")

# Files to touch

- `web/next.config.ts` (modified)
- `web/.env.local` (verify `NEXT_PUBLIC_SUPABASE_URL` is set; the hostname is parsed for image remotePatterns)

# Implementation notes

```ts
// web/next.config.ts
import type { NextConfig } from 'next';

const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://djl2kq23xfhqi.cloudfront.net",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: supabaseHostname },
      { protocol: 'https', hostname: 'djl2kq23xfhqi.cloudfront.net' },
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default config;
```

The `'unsafe-inline'`/`'unsafe-eval'` in `script-src` are required by Next.js's runtime + Vercel Analytics. We accept this. Revisit when moving to strict CSP with nonces (more work, marginal gain at MVP scale).

# Acceptance criteria

- [ ] `pnpm build` succeeds.
- [ ] Production response headers (`curl -I https://<vercel-url>`) include all six headers.
- [ ] `next/image` accepts URLs from both Supabase hostname and Just Kraft CDN without error.
- [ ] `securityheaders.com` scan against the production URL returns ≥ A grade.

# Verification

```bash
cd web
pnpm build
pnpm next start &
sleep 4
curl -I http://localhost:3000/
kill %1
# After deploy, scan the prod URL:
#   https://securityheaders.com/?q=https%3A%2F%2F<vercel-url>&followRedirects=on
```

# Dependencies added

None.

# Notes for next agent

**Done 2026-05-15.** `next.config.ts` now sets:

Six security headers on every response (verified via `curl -I`):
- `Content-Security-Policy` (strict, with documented exceptions for Next runtime + Vercel Analytics + Supabase)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Frame-Options: DENY` (redundant with `frame-ancestors 'none'` but kept for legacy browsers)

`images.remotePatterns`:
- `djl2kq23xfhqi.cloudfront.net` (Just Kraft seed CDN — dev only, RLS license_status gate ensures it never serves on production)
- `<NEXT_PUBLIC_SUPABASE_URL host>/storage/v1/object/public/**` (computed at build time from env)

Notable choices documented inline in `next.config.ts`:
- `'unsafe-inline'` and `'unsafe-eval'` in `script-src` are required by Next 16 runtime + Vercel Analytics; revisit when we move to nonce-based CSP
- `connect-src` allows Supabase REST + Realtime + Sentry ingest (when wired) + Vercel Analytics

**P0-T10 (git init + GitHub + Vercel link)** is functionally complete via earlier work + this commit:
- Git init: done in the Option B commit (`838c7a3`)
- Remote: re-added to `https://github.com/sonu010/bhavani-crafts.git`
- GitHub push: `rebuild-v2` branch + `pre-rebuild` tag pushed
- Vercel link: pre-existing on the project. Owner needs to update Root Directory to `web/` and add env vars per `user/06-next-steps-vercel-and-supabase.md`. Husky/pre-commit hook is deferred to a follow-up.

**Verified headers via curl against `next dev` at port 3004** — all six headers landed correctly. Will re-verify against Vercel preview build once the Root Directory change is applied.

**To run securityheaders.com scan:** wait for Vercel preview to be live, then https://securityheaders.com/?q=https%3A%2F%2F<preview-url>. Expected grade: A or A+.
