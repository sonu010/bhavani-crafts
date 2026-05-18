import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getCategoryForEditing,
  previewMoveCount,
} from "@/lib/db/admin/categories";
import { getCategoryTree } from "@/lib/db/categories";
import { MoveProductsForm } from "./move-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Move products — Bhavani Crafts",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bulk-move products out of a single source category. Reads the
 * source row + the full tree + the initial preview count (no filter)
 * in parallel.
 *
 * Cycles and "target is descendant" are rejected server-side by
 * `moveProductsBetweenCategories`; the form filters out the source
 * subtree from the target picker too so the owner doesn't see
 * invalid options.
 */
export default async function MoveCategoryProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { admin } = await requireAdminContext();

  const [source, tree, initialCount] = await Promise.all([
    getCategoryForEditing(admin, id),
    getCategoryTree(admin),
    previewMoveCount(admin, id, {}),
  ]);
  if (!source) notFound();

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
        <Link
          href={`/admin/categories/${source.id}/edit`}
          className="truncate text-bark-900 underline-offset-2 hover:underline"
        >
          {source.name}
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="font-medium text-bark-900">Move products</span>
      </nav>

      <MoveProductsForm
        sourceId={source.id}
        sourceName={source.name}
        initialCount={initialCount}
        categoryTree={tree}
      />
    </div>
  );
}
