import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getAttributeDefinitionForEditing } from "@/lib/db/admin/attribute-defs";
import { getCategoryTree } from "@/lib/db/categories";
import { AttributeForm } from "../../attribute-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit attribute — Bhavani Crafts",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditAttributePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { admin } = await requireAdminContext();
  const [def, tree, refCount] = await Promise.all([
    getAttributeDefinitionForEditing(admin, id),
    getCategoryTree(admin),
    admin
      .from("product_attributes")
      .select("attribute_id", { head: true, count: "exact" })
      .eq("attribute_id", id),
  ]);
  if (!def) notFound();

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/attributes"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Attributes
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="truncate font-medium text-bark-900" title={def.name}>
          {def.name}
        </span>
      </nav>

      <AttributeForm
        mode="edit"
        attributeId={def.id}
        categoryTree={tree}
        existingProductValueCount={refCount.count ?? 0}
        initial={{
          name: def.name,
          slug: def.slug,
          type: def.type,
          unit: def.unit,
          applies_to_category_id: def.applies_to_category_id,
          options_json: def.options_json,
          is_filterable: def.is_filterable,
          sort_order: def.sort_order,
        }}
      />
    </div>
  );
}
