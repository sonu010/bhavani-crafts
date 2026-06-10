import { ImageResponse } from "next/og";
import { ogTemplate, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/storefront/og-template";

/**
 * Root OG image (P5-T04). Used for:
 *   - the home page (`/`)
 *   - any route that doesn't ship its own opengraph-image.tsx
 *
 * 24-hour revalidate so a brand-copy tweak in this file lands in
 * share previews within a day without an explicit redeploy.
 */
export const alt = "Bhavani Crafts — craft supplies in Hyderabad";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 86400;

export default async function Image() {
  return new ImageResponse(
    ogTemplate({
      title: "Craft supplies, gifting, and pooja staples.",
      eyebrow: "Made in Hyderabad",
    }),
    size,
  );
}
