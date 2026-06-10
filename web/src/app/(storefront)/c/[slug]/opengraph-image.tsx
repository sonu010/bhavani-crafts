import { ImageResponse } from "next/og";
import { ogTemplate, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/storefront/og-template";
import { createPublicClient } from "@/lib/db/public-client";
import { getCategoryBySlug } from "@/lib/db/categories";

/**
 * Per-category OG image (P5-T04). Falls back to the root template
 * when the category lookup fails or returns null — keeps share
 * previews working even for soft-deleted/renamed categories the
 * crawler may still be probing.
 */
export const alt = "Shop a category at Bhavani Crafts";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 86400;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title = "Browse the catalogue.";
  try {
    const cat = await getCategoryBySlug(createPublicClient(), slug);
    if (cat?.name) title = cat.name;
  } catch {
    // intentional: degrade to fallback title rather than failing the
    // OG request and leaving the share-preview with no image.
  }

  return new ImageResponse(
    ogTemplate({ title, eyebrow: "Category" }),
    size,
  );
}
