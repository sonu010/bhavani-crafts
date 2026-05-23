/**
 * Runtime-validated shapes for /admin/attributes.
 *
 * The DB CHECK on `attribute_definitions.options_json` requires a
 * non-empty array for `type='select'` and null for everything else.
 * The Zod schema mirrors that — caller of `createAttribute` /
 * `updateAttribute` gets a typed error before round-tripping.
 */
import { z } from "zod";

export const ATTRIBUTE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slugifyForAttribute(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const AttributeTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "select",
]);
export type AttributeType = z.infer<typeof AttributeTypeSchema>;

export const AttributeDefinitionInputSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(80, "Name must be 80 characters or fewer"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80, "Slug must be 80 characters or fewer")
      .regex(ATTRIBUTE_SLUG_REGEX, "Lowercase letters, digits, and dashes only"),
    type: AttributeTypeSchema,
    unit: z
      .string()
      .max(20, "Unit must be 20 characters or fewer")
      .nullable(),
    applies_to_category_id: z.string().uuid().nullable(),
    options_json: z.array(z.string().min(1).max(60)).nullable(),
    is_filterable: z.boolean(),
    sort_order: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Per the DB CHECK: select needs ≥1 option; other types must NOT
    // carry an options_json payload.
    if (data.type === "select") {
      if (!data.options_json || data.options_json.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Select attributes need at least one option",
          path: ["options_json"],
        });
      } else {
        // Reject duplicates (case-insensitive).
        const seen = new Set<string>();
        for (let i = 0; i < data.options_json.length; i++) {
          const key = data.options_json[i].trim().toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: "custom",
              message: `Duplicate option "${data.options_json[i]}"`,
              path: ["options_json", i],
            });
          }
          seen.add(key);
        }
      }
    } else if (data.options_json !== null && data.options_json.length > 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "options_json only applies to select attributes; clear it for other types",
        path: ["options_json"],
      });
    }
    // Unit is only meaningful for numbers; tolerate but warn at the UI
    // layer. (Don't reject — some text attrs use unit-like suffixes.)
  });

export type AttributeDefinitionInput = z.infer<
  typeof AttributeDefinitionInputSchema
>;
