import { requireAdminContext } from "@/lib/db/admin-context";
import { listAttributeDefinitionsAdmin } from "@/lib/db/admin/attribute-defs";
import { perfStart } from "@/lib/perf";
import { AttributesTable } from "./attributes-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Attributes — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * Attribute-definitions index. Grouped by `applies_to_category_id`
 * (null = "Global"). Each row shows type / unit / option count /
 * filterable flag / value count + Edit + Delete actions.
 */
export default async function AttributesPage() {
  const t = perfStart("/admin/attributes");
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const defs = await listAttributeDefinitionsAdmin(admin);
  t.mark("fetch");
  t.end();

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Attributes</h1>
          <p className="text-sm text-stone-500">
            {defs.length} definition{defs.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono">text / number / boolean / select</span>.
            Used by product editors (T13) and storefront facets (Phase 3).
          </p>
        </div>
        <a
          href="/admin/attributes/new"
          className="inline-flex items-center justify-center rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 text-sm font-medium text-bark-900 hover:bg-paper-50"
        >
          + New attribute
        </a>
      </header>

      <AttributesTable defs={defs} />
    </div>
  );
}
