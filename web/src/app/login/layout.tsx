import type { Metadata } from "next";

/**
 * /login layout. Two responsibilities:
 *   1. Sets `<meta name="robots" content="noindex, nofollow">` on every page
 *      under this route. Defense in depth alongside the X-Robots-Tag
 *      response header in next.config.ts.
 *   2. Acts as a route boundary so the parent root layout's marketing
 *      chrome (when added in Phase 3) doesn't bleed into the auth pages.
 *
 * See claude/SESSION-RESUME.md §"Admin login" — layers 8 + 9 of the
 * 10-layer defense.
 */
export const metadata: Metadata = {
  title: "Sign in — Bhavani Crafts",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
