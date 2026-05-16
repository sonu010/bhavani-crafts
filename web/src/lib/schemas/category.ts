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
