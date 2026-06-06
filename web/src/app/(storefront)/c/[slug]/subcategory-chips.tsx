import Link from "next/link";
import type { Category } from "@/lib/schemas/category";

/**
 * Sub-category refine row (P3-T11.1). When the current category has
 * direct child categories, render them as a horizontally-scrollable
 * chip list so visitors can narrow without leaving the page. The single
 * highest-signal navigation aid for a parent category like
 * "Art Stationery" → Pencils / Brushes / Erasers / Sketchbooks.
 *
 * Prop is `items` (not `children`) because React's `children` is a
 * reserved prop name — lint refuses it. Hides itself when empty
 * (leaf category).
 *
 * Server component — each chip is a plain <Link> to the child's own
 * category page. No client JS, no shared state. The child page renders
 * its own sub-row if it has further children.
 */
export function SubcategoryChips({ items }: { items: Category[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Sub-categories"
      className="-mx-6 mt-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-2">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/c/${c.slug}`}
              className="inline-flex h-8 items-center rounded-full border border-husk-200 bg-paper-0 px-3 text-xs font-medium text-bark-900 transition-colors hover:border-teal-800 hover:text-teal-900"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
