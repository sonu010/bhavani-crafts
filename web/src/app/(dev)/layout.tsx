/**
 * The (dev) route group is dev-only.
 *
 * Production gating moved to the edge proxy (`web/src/proxy.ts`) in P2-T04
 * because the layout-level `notFound()` only changed the HTTP status —
 * the RSC payload was still serialized in the response body, leaking the
 * gallery content. The proxy short-circuits before any rendering.
 *
 * Keeping the route-group layout as a passthrough so the file structure
 * still segments dev pages from production routes.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
