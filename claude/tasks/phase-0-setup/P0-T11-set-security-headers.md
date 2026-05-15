---
id: P0-T11
phase: 0
title: Set security headers + image remotePatterns in next.config
status: not_started
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

(filled in when status → done)
