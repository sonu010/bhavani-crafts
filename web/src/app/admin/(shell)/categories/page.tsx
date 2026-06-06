import { requireAdminContext } from "@/lib/db/admin-context";
import { getCategoryTreeWithCounts } from "@/lib/db/admin/categories";
import { perfStart } from "@/lib/perf";
import { CategoriesTree } from "./categories-tree";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

/**
 * Admin categories index. One round-trip to fetch the tree + counts;
 * the client component handles expand/collapse, soft-delete, and the
 * action-menu navigation links.
 *
 * Expanded state lives in the URL (`?expanded=id1,id2,...`) so a
 * shared link to "/admin/categories?expanded=foo" lands with the
 * "foo" branch already open. The server reads it on initial render.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ expanded?: string | string[] }>;
}) {
  const t = perfStart("/admin/categories");
  const sp = await searchParams;
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const tree = await getCategoryTreeWithCounts(admin);
  t.mark("fetch");
  t.end();

  const expandedRaw = Array.isArray(sp.expanded) ? sp.expanded[0] : sp.expanded;
  const initialExpanded = expandedRaw
    ? expandedRaw.split(",").filter(Boolean)
    : tree.map((n) => n.id); // top-level open by default

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Categories</h1>
          <p className="text-sm text-stone-500">
            {flatCount(tree)} categories · click a row to expand subtree.
          </p>
        </div>
        {/* Create lands in P2-T19. Surface the entry point so the
           muscle-memory works once it ships. */}
        <a
          href="/admin/categories/new"
          className="inline-flex items-center justify-center rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 text-sm font-medium text-bark-900 hover:bg-paper-50"
        >
          + New category
        </a>
      </header>

      <CategoriesTree tree={tree} initialExpanded={initialExpanded} />
    </div>
  );
}

function flatCount(tree: { children: { children: unknown[] }[] }[]): number {
  let n = 0;
  const walk = (nodes: Array<{ children: unknown[] }>): void => {
    for (const c of nodes) {
      n += 1;
      walk(c.children as Array<{ children: unknown[] }>);
    }
  };
  walk(tree as Array<{ children: unknown[] }>);
  return n;
}
