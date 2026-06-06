import Image, { type ImageProps } from "next/image";

/**
 * Storefront `<Image>` wrapper that skips Vercel's image optimizer for
 * sources that come from third-party CDNs we don't own.
 *
 * Why: JustKraft seed images (~15k of them, served from
 * `djl2kq23xfhqi.cloudfront.net`) are visible on the live preview while
 * the rebuild is in flight. Each unique `(url × width × quality)` combo
 * the optimizer sees is a Vercel "source image" — Hobby plans cap at
 * 1,000 / month. With 24 cards × ~4 widths per category page, browsing
 * 10 categories blows the quota. Worse, each cold optimization adds
 * 300-800 ms of latency to first paint (fetch source → resize → encode
 * AVIF) which is what surfaced as "first visit shows no images, reload
 * fine."
 *
 * Fix: pass `unoptimized={true}` for third-party-hosted sources. The
 * browser fetches direct from cloudfront. We lose AVIF/WebP re-encoding
 * for those images, but cloudfront already serves JPEGs at reasonable
 * sizes and the optimizer hop costs more than it saves.
 *
 * Supabase Storage URLs (`*.supabase.co/storage/...`) STAY optimized —
 * those are ours, we serve them at random sizes, and the optimizer's
 * resize + format work earns its keep.
 *
 * When all images are migrated to Supabase Storage in P4-T11, this
 * wrapper becomes a thin pass-through and can be deleted.
 */

/** Hostnames whose images we serve direct, without Vercel's optimizer. */
const UNOPTIMIZED_HOSTS = new Set<string>([
  "djl2kq23xfhqi.cloudfront.net", // JustKraft seed CDN
]);

function shouldUnoptimize(src: ImageProps["src"]): boolean {
  if (typeof src !== "string") return false;
  // Relative `/public` URLs (e.g. SVG logos) start with `/` — leave them
  // to Next's default handling; the optimizer skips them anyway.
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    return UNOPTIMIZED_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

export function StorefrontImage(props: ImageProps) {
  // Caller may force `unoptimized` (e.g. test fixtures); respect it.
  // Otherwise opt out automatically for known third-party hosts.
  const unoptimized = props.unoptimized ?? shouldUnoptimize(props.src);
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is forwarded via {...props}; ESLint can't see through the spread
  return <Image {...props} unoptimized={unoptimized} />;
}
