import type {
  AttributeDefinition,
  ProductAttributeRow,
} from "@/lib/db/attributes";

/**
 * PDP attributes table (P3-T13). Joins definitions + row values in
 * memory; only renders rows the admin actually filled. Read-only;
 * editing happens on the admin product editor.
 */
function formatAttributeValue(
  def: AttributeDefinition,
  row: ProductAttributeRow,
): string | null {
  switch (def.type) {
    case "text":
    case "select":
      return row.value_text;
    case "number": {
      if (row.value_number == null) return null;
      return def.unit ? `${row.value_number} ${def.unit}` : String(row.value_number);
    }
    case "boolean":
      if (row.value_boolean == null) return null;
      return row.value_boolean ? "Yes" : "No";
    default:
      return null;
  }
}

export function AttributesTable({
  defs,
  rows,
}: {
  defs: AttributeDefinition[];
  rows: ProductAttributeRow[];
}) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const populated = rows
    .map((r) => {
      const def = byId.get(r.attribute_id);
      if (!def) return null;
      const value = formatAttributeValue(def, r);
      return value == null ? null : { def, value };
    })
    .filter((x): x is { def: AttributeDefinition; value: string } => x !== null)
    .sort((a, b) => a.def.sort_order - b.def.sort_order || a.def.slug.localeCompare(b.def.slug));

  if (populated.length === 0) return null;

  return (
    <section aria-labelledby="attrs-heading" className="space-y-3">
      <h2
        id="attrs-heading"
        className="text-xs font-medium uppercase tracking-wide text-stone-500"
      >
        Details
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {populated.map(({ def, value }) => (
          <div key={def.id} className="flex gap-2 border-b border-husk-200 py-2">
            <dt className="w-1/2 text-stone-500">{def.name}</dt>
            <dd className="w-1/2 text-bark-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
