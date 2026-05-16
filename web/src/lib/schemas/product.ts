/**
 * Runtime-validated product shapes returned by lib/db/products.ts.
 *
 * Zod validates what Supabase returns at parse time. If it ever drifts
 * from what the schema in 0001+0003 declares, we get a loud error
 * instead of a downstream NPE. Fail fast.
 *
 * These shapes are SUBSETS of the DB columns — only the fields our
 * application code needs are validated. Adding columns to the DB
 * doesn't break these schemas (Zod ignores unknown keys by default).
 */
import { z } from "zod";

export const StockStatusSchema = z.enum([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "made_to_order",
  "unknown",
]);

export const ReviewStatusSchema = z.enum([
  "draft",
  "needs_review",
  "ready_to_publish",
  "published",
  "archived",
]);

/** A product card on a listing (homepage / category page / search results). */
export const ProductListItemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  slug: z.string(),
  name: z.string(),
  short_description: z.string().nullable(),
  base_price_inr: z.number().nullable(),
  compare_at_price_inr: z.number().nullable(),
  stock_status: StockStatusSchema,
  is_featured: z.boolean(),
  created_at: z.string(),
});
export type ProductListItem = z.infer<typeof ProductListItemSchema>;

/** A category badge embedded in product detail responses. */
export const CategoryBadgeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
});
export type CategoryBadge = z.infer<typeof CategoryBadgeSchema>;

/** An image on a product detail page. */
export const ProductImageSchema = z.object({
  id: z.string().uuid(),
  url: z.url(),
  alt: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sort_order: z.number().int(),
  blur_data_url: z.string().nullable(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

/** A purchasable variant. */
export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string().nullable(),
  price_inr: z.number().nullable(),
  compare_at_price_inr: z.number().nullable(),
  stock_status: StockStatusSchema,
  is_default: z.boolean(),
  sort_order: z.number().int(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

/** A tag badge on a product. */
export const TagBadgeSchema = z.object({
  slug: z.string(),
  name: z.string(),
});
export type TagBadge = z.infer<typeof TagBadgeSchema>;

/** Full product detail (PDP). Embeds category, images, variants, tags. */
export const ProductDetailSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  short_description: z.string().nullable(),
  base_price_inr: z.number().nullable(),
  compare_at_price_inr: z.number().nullable(),
  stock_status: StockStatusSchema,
  min_order_qty: z.number().int().positive(),
  max_order_qty: z.number().int().nullable(),
  is_featured: z.boolean(),
  category: CategoryBadgeSchema.nullable(),
  images: z.array(ProductImageSchema),
  variants: z.array(ProductVariantSchema),
  tags: z.array(TagBadgeSchema),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;
