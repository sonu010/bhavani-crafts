/**
 * CSV row schema for /admin/imports.
 *
 * Maps the CSV columns (string-typed) into a normalized product input
 * with type coercion. Empty strings become null where the column is
 * optional. Required columns: `sku`, `name`, `base_price_inr`.
 *
 * Returns a discriminated result via `.safeParse` — the validator
 * decides downstream whether the row is create/update/skip/error.
 */
import { z } from "zod";
import { SLUG_REGEX, SKU_REGEX } from "@/lib/schemas/product";

const trimmedString = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === "" ? null : s));

const requiredTrimmed = z.string().transform((s) => s.trim()).pipe(z.string().min(1));

const optionalInt = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => {
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && Number.isInteger(n) ? n : NaN;
  })
  .refine((v) => v === null || !Number.isNaN(v), {
    message: "must be an integer or empty",
  });

const requiredInt = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s !== "", { message: "required" })
  .transform((s) => Number(s))
  .refine((v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0, {
    message: "must be a non-negative integer",
  });

const STOCK_STATUSES = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "made_to_order",
  "unknown",
] as const;

export const CsvRowInputSchema = z.object({
  sku: requiredTrimmed.pipe(z.string().regex(SKU_REGEX, "SKU must match uppercase + dashes")),
  slug: trimmedString.transform((v) => (v ?? "").trim() || null)
    .refine(
      (v) => v === null || SLUG_REGEX.test(v),
      "slug must match lowercase + dashes",
    ),
  name: requiredTrimmed,
  short_description: trimmedString,
  description: trimmedString,
  base_price_inr: requiredInt,
  compare_at_price_inr: optionalInt,
  stock_status: z
    .string()
    .transform((s) => (s.trim() === "" ? "unknown" : s.trim()))
    .pipe(z.enum(STOCK_STATUSES)),
  stock_quantity: optionalInt,
  category_slug: trimmedString,
  tags: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
});

export type CsvRowInput = z.infer<typeof CsvRowInputSchema>;

/** Columns the importer recognises. Anything else is dropped with a
 *  warning. */
export const RECOGNISED_CSV_COLUMNS = [
  "sku",
  "slug",
  "name",
  "short_description",
  "description",
  "base_price_inr",
  "compare_at_price_inr",
  "stock_status",
  "stock_quantity",
  "category_slug",
  "tags",
] as const;
