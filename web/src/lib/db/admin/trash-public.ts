/**
 * Client-importable types + constants for Trash. No `server-only`
 * boundary so client components can render entity-type labels
 * without pulling the data layer into the bundle.
 */

export const TRASH_ENTITY_TYPES = [
  "products",
  "categories",
  "tags",
  "product_images",
  "product_variants",
] as const;

export type TrashEntityType = (typeof TRASH_ENTITY_TYPES)[number];

export const TRASH_ENTITY_LABELS: Record<TrashEntityType, string> = {
  products: "Products",
  categories: "Categories",
  tags: "Tags",
  product_images: "Images",
  product_variants: "Variants",
};

export interface TrashedRow {
  id: string;
  label: string;
  sublabel: string | null;
  deleted_at: string;
}
