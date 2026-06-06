import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getCategoryForEditing } from "@/lib/db/admin/categories";
import { getCategoryTree } from "@/lib/db/categories";
import { CategoryForm } from "../../category-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit category",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { admin } = await requireAdminContext();
  const [category, categoryTree] = await Promise.all([
    getCategoryForEditing(admin, id),
    getCategoryTree(admin),
  ]);
  if (!category) notFound();

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/categories"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Categories
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="truncate font-medium text-bark-900" title={category.name}>
          {category.name}
        </span>
      </nav>

      <CategoryForm
        mode="edit"
        categoryId={category.id}
        categoryTree={categoryTree}
        initial={{
          name: category.name,
          slug: category.slug,
          description: category.description,
          parent_id: category.parent_id,
          sort_order: category.sort_order,
          image_url: category.image_url,
          meta_title: category.meta_title,
          meta_description: category.meta_description,
        }}
      />
    </div>
  );
}
