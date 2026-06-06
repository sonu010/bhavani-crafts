import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getCategoryTree } from "@/lib/db/categories";
import { AttributeForm } from "../attribute-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New attribute",
  robots: { index: false, follow: false },
};

export default async function NewAttributePage() {
  const { admin } = await requireAdminContext();
  const tree = await getCategoryTree(admin);

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
        <span className="font-medium text-bark-900">New</span>
      </nav>

      <AttributeForm
        mode="create"
        categoryTree={tree}
        initial={{
          name: "",
          slug: "",
          type: "text",
          unit: null,
          applies_to_category_id: null,
          options_json: null,
          is_filterable: true,
          sort_order: 0,
        }}
      />
    </div>
  );
}
