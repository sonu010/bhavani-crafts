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

/**
 * Slug regex — mirrors the CHECK constraint in 0001_init.sql.
 * Lowercase alphanumeric + dashes, 1–80 chars, must start with [a-z0-9].
 */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * SKU regex — uppercase letters/digits + dashes. Not enforced by the DB
 * (the column is just `text NOT NULL UNIQUE`), but the admin form
 * normalizes input to this shape so SKUs render predictably.
 */
export const SKU_REGEX = /^[A-Z0-9][A-Z0-9-]*$/;

/**
 * Editable-fields shape for the General tab (P2-T11).
 *
 * `.strict()` rejects unknown keys — category_id, images, variants,
 * attributes belong to the other tabs and should never tunnel through
 * the General save action.
 *
 * Cross-field rules (compare_at > base price, max_order >= min_order)
 * apply via `.superRefine` on the exported wrapped schema.
 */
export const ProductEditInputSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be 200 characters or fewer"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80, "Slug must be 80 characters or fewer")
      .regex(SLUG_REGEX, "Lowercase letters, digits, and dashes only"),
    sku: z
      .string()
      .min(1, "SKU is required")
      .regex(SKU_REGEX, "Uppercase letters, digits, and dashes only"),
    short_description: z
      .string()
      .max(280, "Short description must be 280 characters or fewer")
      .nullable(),
    description: z.string().nullable(),
    base_price_inr: z.number().int().nonnegative().nullable(),
    compare_at_price_inr: z.number().int().nonnegative().nullable(),
    stock_status: StockStatusSchema,
    stock_quantity: z.number().int().nonnegative().nullable(),
    low_stock_threshold: z.number().int().nonnegative(),
    allow_backorder: z.boolean(),
    min_order_qty: z.number().int().positive(),
    max_order_qty: z.number().int().positive().nullable(),
    meta_title: z.string().max(60).nullable(),
    meta_description: z.string().max(160).nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.base_price_inr != null &&
      data.compare_at_price_inr != null &&
      data.compare_at_price_inr <= data.base_price_inr
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Compare-at price must be greater than the base price",
        path: ["compare_at_price_inr"],
      });
    }
    if (data.max_order_qty != null && data.max_order_qty < data.min_order_qty) {
      ctx.addIssue({
        code: "custom",
        message: "Max order qty must be at least the min order qty",
        path: ["max_order_qty"],
      });
    }
  });

export type ProductEditInput = z.infer<typeof ProductEditInputSchema>;

/** Helper — slugify a name into the canonical admin slug shape. */
export function slugifyForProduct(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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
