import type { NextConfig } from "next";

/**
 * Security headers + image hosts.
 * See claude/architecture/security.md §"Security headers" and §"Image remotePatterns".
 */

// Allow images from:
//   - Supabase Storage of our project (`<ref>.supabase.co`)
//   - Just Kraft seed CDN (dev only; rehosted before launch in P4-T11)
// Hostname pulled from env so changes don't need a code edit.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl
  ? new URL(supabaseUrl).hostname
  : undefined;

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

  images: {
    remotePatterns: [
      // Just Kraft seed CDN — dev only; never serves on production (RLS
      // license_status gate). Tracked so /api/health and dev previews can render.
      {
        protocol: "https",
        hostname: "djl2kq23xfhqi.cloudfront.net",
      },
      // Supabase Storage public URLs for product images.
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
