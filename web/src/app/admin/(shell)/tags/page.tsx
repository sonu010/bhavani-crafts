import { requireAdminContext } from "@/lib/db/admin-context";
import { listTagsWithCounts } from "@/lib/db/admin/tags";
import { perfStart } from "@/lib/perf";
import { TagsTable } from "./tags-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tags — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * Admin tags index. Single round-trip to load all tags + their
 * product_tags counts. The client table handles inline create,
 * rename, soft-delete, and merge.
 */
export default async function TagsPage() {
  const t = perfStart("/admin/tags");
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const tags = await listTagsWithCounts(admin);
  t.mark("fetch");
  t.end();

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Tags</h1>
          <p className="text-sm text-stone-500">
            {tags.length} tag{tags.length === 1 ? "" : "s"} · free-form keywords
            used by search synonyms and cross-cutting product groupings.
          </p>
        </div>
      </header>

      <TagsTable tags={tags} />
    </div>
  );
}
