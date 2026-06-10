import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security headers + image hosts.
 * See claude/architecture/security.md §"Security headers" and §"Image remotePatterns".
 */

// Allow images from:
//   - Supabase Storage of our project (`<ref>.supabase.co`)
//   - Just Kraft seed CDN (dev only; rehosted before launch in P4-T11)
// Hostname pulled from env. Missing env is a deploy-blocker — fail fast.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is required. Set it in web/.env.local or the Vercel project's env vars.",
  );
}
const supabaseHostname = new URL(supabaseUrl).hostname;

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` and `'unsafe-eval'` in script-src are required by Next 16
 * runtime + Vercel Analytics. Acceptable trade-off at MVP; revisit when we
 * move to nonce-based CSP (more work, marginal gain at our scale).
 *
 * `connect-src` allows:
 *   - 'self'                       — our own server actions / API routes
 *   - https://*.supabase.co        — Supabase REST + Realtime
 *   - https://*.ingest.sentry.io   — Sentry (when wired in P5-T05)
 *   - https://va.vercel-scripts.com — Vercel Analytics (when enabled)
 */
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
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // X-Frame-Options is redundant with CSP frame-ancestors but kept for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Dev-only (ignored in production builds). Next 16 blocks cross-origin
  // requests to dev resources + Server Action POSTs unless the requesting
  // host is whitelisted here. The Playwright E2E drives the dev server at
  // http://127.0.0.1:3000, so without this the /login Server Action is
  // silently rejected (form never navigates). localhost is allowed by
  // default; 127.0.0.1 must be listed explicitly.
  allowedDevOrigins: ["127.0.0.1"],

  images: {
    remotePatterns: [
      // Just Kraft seed CDN — dev only; never serves on production (RLS
      // license_status gate). Tracked so dev previews + admin can render.
      {
        protocol: "https",
        hostname: "djl2kq23xfhqi.cloudfront.net",
      },
      // Supabase Storage public URLs for product images.
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Layer 8 of the 10-layer admin-login defense
        // (SESSION-RESUME §"Admin login"). The /login `metadata.robots`
        // meta tag covers HTML-page indexing; this header covers other
        // content types and crawlers that read headers (Googlebot).
        source: "/login",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

/**
 * Sentry wrapper (P5-T05). No-ops cleanly when no Sentry env vars are
 * set, so dev + CI builds without SENTRY_DSN keep working unchanged.
 * When the owner provisions Sentry, three env vars enable the pipeline:
 *   - SENTRY_DSN              (server + edge events)
 *   - NEXT_PUBLIC_SENTRY_DSN  (browser events)
 *   - SENTRY_AUTH_TOKEN       (source-map upload at build)
 * Plus org/project come from the project's Vercel integration or fall
 * back to env. `tunnelRoute` routes Sentry requests through Next so
 * ad-blockers blocking sentry.io domains don't blackhole telemetry.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  // Don't try to upload source-maps without an auth token — avoids
  // noisy warnings on CI/dev builds before the owner has set
  // SENTRY_AUTH_TOKEN in Vercel.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
