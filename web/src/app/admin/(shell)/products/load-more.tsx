import Link from "next/link";
import type { AdminCursor } from "@/lib/db/admin/products";
import { encodeCursor } from "@/lib/db/admin/products";

/**
 * "Load more" — same-page link that appends ?cursor= to the current
 * filter state. Forward-only pagination; user goes back via browser
 * back-button.
 */
export function LoadMore({
  cursor,
  status,
  sort,
  extraParams,
}: {
  cursor: AdminCursor | null;
  status: string;
  sort: string;
  extraParams?: Record<string, string>;
}) {
  if (!cursor) return null;
  const search = new URLSearchParams();
  search.set("status", status);
  search.set("sort", sort);
  search.set("cursor", encodeCursor(cursor));
  for (const [k, v] of Object.entries(extraParams ?? {})) {
    if (v) search.set(k, v);
  }
  return (
    <div className="flex justify-center pt-2">
      <Link
        href={`/admin/products?${search.toString()}`}
        className="rounded-md border border-husk-200 px-4 py-2 text-sm text-bark-900 hover:bg-husk-100"
      >
        Load more
      </Link>
    </div>
  );
}
