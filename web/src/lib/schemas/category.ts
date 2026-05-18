/**
 * Runtime-validated category shapes returned by lib/db/categories.ts.
 */
import { z } from "zod";

/** A single row from `categories`, as queried for the storefront. */
export const CategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parent_id: z.string().uuid().nullable(),
  sort_order: z.number().int(),
  image_url: z.string().nullable(),
});
export type Category = z.infer<typeof CategorySchema>;

/** A node in a category tree response (recursive). */
export const CategoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
  image_url: z.string().nullable(),
  children: z.lazy(() => z.array(CategoryTreeNodeSchema)),
});
export interface CategoryTreeNode {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  image_url: string | null;
  children: CategoryTreeNode[];
}

/**
 * Slug regex — mirrors the CHECK on categories.slug.
 * Lowercase alphanumeric + dashes, 1–80 chars, start with [a-z0-9].
 */
export const CATEGORY_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slugifyForCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Editable fields for /admin/categories create + edit. */
export const CategoryEditInputSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or fewer"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80, "Slug must be 80 characters or fewer")
      .regex(CATEGORY_SLUG_REGEX, "Lowercase letters, digits, and dashes only"),
    description: z.string().nullable(),
    parent_id: z.string().uuid().nullable(),
    sort_order: z.number().int().nonnegative(),
    image_url: z.string().nullable(),
    meta_title: z.string().max(60, "Meta title must be 60 characters or fewer").nullable(),
    meta_description: z
      .string()
      .max(160, "Meta description must be 160 characters or fewer")
      .nullable(),
  })
  .strict();

export type CategoryEditInput = z.infer<typeof CategoryEditInputSchema>;
