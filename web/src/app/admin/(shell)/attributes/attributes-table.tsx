"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminAttributeDefinition } from "@/lib/db/admin/attribute-defs";
import { deleteAttributeAction } from "./actions";

const TYPE_BADGE: Record<AdminAttributeDefinition["type"], string> = {
  text: "bg-husk-100 text-stone-700",
  number: "bg-teal-50 text-teal-900",
  boolean: "bg-moss-50 text-moss-900",
  select: "bg-saffron-50 text-clay-700",
};

/**
 * Attribute definitions grouped by `applies_to_category_id`.
 *
 *   - Global definitions (applies_to_category_id IS NULL) group first.
 *   - Then each category gets its own group sorted by category name.
 *
 * Per-row Edit links to /[id]/edit; Delete fires the action.
 */
export function AttributesTable({
  defs,
}: {
  defs: AdminAttributeDefinition[];
}) {
  const [rows, setRows] = useState(defs);

  const groups = useMemo(() => {
    const byCat = new Map<string, AdminAttributeDefinition[]>();
    for (const d of rows) {
      const key = d.applies_to_category_id ?? "__global__";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(d);
    }
    // Sort: globals first, then by category name asc.
    return [...byCat.entries()].sort((a, b) => {
      if (a[0] === "__global__") return -1;
      if (b[0] === "__global__") return 1;
      const aName = a[1][0]?.applies_to_category_name ?? "";
      const bName = b[1][0]?.applies_to_category_name ?? "";
      return aName.localeCompare(bName);
    });
  }, [rows]);

  const onDelete = useCallback((d: AdminAttributeDefinition) => {
    if (d.product_value_count > 0) {
      toast.error(
        `Cannot delete: ${d.product_value_count} product${d.product_value_count === 1 ? "" : "s"} have${d.product_value_count === 1 ? "" : ""} values for this attribute. Clear them from the product editor first.`,
      );
      return;
    }
    if (!window.confirm(`Delete attribute "${d.name}"? This is permanent.`)) {
      return;
    }
    (async () => {
      const r = await deleteAttributeAction(d.id);
      if (r.ok) {
        toast.success(`"${d.name}" deleted`);
        setRows((prev) => prev.filter((x) => x.id !== d.id));
        return;
      }
      if (r.error.code === "in_use") {
        toast.error(
          `Cannot delete: ${r.error.productValueCount} product values still reference this`,
        );
      } else if (r.error.code === "not_found") {
        toast.error("Already deleted");
      }
    })();
  }, []);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
        No attribute definitions yet.{" "}
        <Link
          href="/admin/attributes/new"
          className="text-teal-800 underline-offset-2 hover:underline"
        >
          Create the first →
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([key, items]) => (
        <section
          key={key}
          className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0"
        >
          <header className="border-b border-husk-200/60 bg-paper-50 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-600">
              {key === "__global__"
                ? "Global"
                : (items[0]?.applies_to_category_name ?? "Category")}
            </p>
          </header>
          <ul className="divide-y divide-husk-200/60">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-bark-900">
                  {d.name}
                </span>
                <span
                  className={`hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase sm:inline-flex ${TYPE_BADGE[d.type]}`}
                >
                  {d.type}
                  {d.unit ? ` · ${d.unit}` : ""}
                  {d.type === "select" && d.options_json
                    ? ` · ${d.options_json.length} opt`
                    : ""}
                </span>
                <span className="hidden truncate font-mono text-[11px] text-stone-500 md:block md:max-w-40">
                  {d.slug}
                </span>
                <span
                  className="shrink-0 rounded-full bg-husk-100 px-2 py-0.5 font-mono text-[10px] text-stone-600"
                  title={`${d.product_value_count} product values reference this`}
                >
                  {d.product_value_count}
                </span>
                {!d.is_filterable ? (
                  <span className="hidden rounded-full bg-stone-200 px-2 py-0.5 font-mono text-[10px] text-stone-600 sm:inline-flex">
                    hidden
                  </span>
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/admin/attributes/${d.id}/edit`}
                    aria-label="Edit attribute"
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-husk-200 bg-paper-0 text-bark-900 transition hover:bg-paper-50 focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30"
                  >
                    <Pencil className="size-3.5" />
                  </Link>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => onDelete(d)}
                    aria-label="Delete attribute"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
