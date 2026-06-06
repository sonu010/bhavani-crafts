/**
 * Canonical site origin (no trailing slash). Used by JSON-LD, sitemap,
 * robots, and any absolute-URL emitter.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  — explicit. Set this once the real domain
 *      points at the deployment.
 *   2. VERCEL_URL (server)   — the deployment's preview host. Vercel
 *      sets this automatically; not prefixed with https://.
 *   3. http://localhost:3000 — local development fallback.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
