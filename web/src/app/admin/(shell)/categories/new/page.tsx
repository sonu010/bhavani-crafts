import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getCategoryTree } from "@/lib/db/categories";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New category — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * Create a new category. `?parent=<id>` pre-selects the parent so the
 * "Add child" action on the tree view lands the right hierarchy
 * value.
 */
export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string | string[] }>;
}) {
  const sp = await searchParams;
  const { admin } = await requireAdminContext();
  const categoryTree = await getCategoryTree(admin);

  const parentRaw = Array.isArray(sp.parent) ? sp.parent[0] : sp.parent;
  const parent_id = typeof parentRaw === "string" ? parentRaw : null;

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
        <span className="font-medium text-bark-900">New</span>
      </nav>

      <CategoryForm
        mode="create"
        categoryTree={categoryTree}
        initial={{
          name: "",
          slug: "",
          description: null,
          parent_id,
          sort_order: 0,
          image_url: null,
          meta_title: null,
          meta_description: null,
        }}
      />
    </div>
  );
}
