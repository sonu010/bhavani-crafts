import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/storefront/site-url";

/**
 * robots.txt (P3-T24). Allows the public storefront, blocks the
 * admin + auth + API surfaces.
 *
 * Admin pages already set `robots: noindex` in their metadata, but
 * robots.txt is the CRAWLER-LEVEL guard — a misconfigured page meta
 * tag (or a crawler that ignores it) can't reach `/admin` if the path
 * is disallowed here. Defense in depth.
 *
 * Also points crawlers at the sitemap so they don't have to discover
 * URLs by following links.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /admin/* — every admin page; per-page robots:noindex is the
        // belt, this is the suspenders.
        // /auth/*  — login, 2FA verify, password reset.
        // /api/*   — internal route handlers.
        // /design  — dev-only page (production middleware returns 404,
        //            but disallow regardless).
        disallow: ["/admin", "/auth", "/api", "/design"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
