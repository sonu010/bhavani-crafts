import { ImageResponse } from "next/og";
import { ogTemplate, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/storefront/og-template";
import { getPdpView } from "@/lib/db/pdp";

/**
 * Per-product OG image (P5-T04). Shows the product name + price +
 * primary image. Falls back to text-only if the product can't be
 * resolved or has no images — share previews still get a branded
 * card rather than the platform-default "site couldn't generate a
 * preview" treatment.
 */
export const alt = "View a Bhavani Crafts product";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 86400;

function inrLabel(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title = "Shop Bhavani Crafts.";
  let priceLabel: string | undefined;
  let imageUrl: string | undefined;

  try {
    const view = await getPdpView(slug);
    if (view) {
      title = view.product.name;
      if (view.product.base_price_inr != null) {
        priceLabel = inrLabel(view.product.base_price_inr);
      }
      const firstImage = view.product.images[0]?.url;
      // Satori (under `ImageResponse`) only supports PNG / JPEG / GIF /
      // BMP — NOT WebP or AVIF. The current catalogue is 100% WebP, so
      // PDP OGs would always end up text-only. Filter explicitly so
      // the fallback path is the intended one (clean text-only card)
      // rather than a Satori warning + broken-image box. When we
      // backfill non-WebP variants (e.g. PNG thumbnails), drop this
      // guard and the image will start rendering automatically.
      if (
        firstImage &&
        /^https:\/\//.test(firstImage) &&
        !/\.(webp|avif)(\?|#|$)/i.test(firstImage)
      ) {
        imageUrl = firstImage;
      }
    }
  } catch {
    // Fall through to text-only fallback below.
  }

  return new ImageResponse(
    ogTemplate({ title, eyebrow: "Product", priceLabel, imageUrl }),
    size,
  );
}
