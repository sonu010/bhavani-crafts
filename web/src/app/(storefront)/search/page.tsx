import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { ProductCardGrid } from "@/components/storefront/product-card-grid";
import { createPublicClient } from "@/lib/db/public-client";
import { searchProductCards } from "@/lib/db/storefront";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import { logSearch } from "./actions";

// Search results are query-dependent so the page is dynamic on `?q=`.
// The underlying read is uncached (each query is its own combination).
export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 120;

export const metadata: Metadata = {
  title: "Search",
  // Don't have search-result pages indexed; they're query-specific.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ q?: string | string[] }>;

function readQuery(sp: Awaited<SearchParams>): string {
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_QUERY_LEN);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const query = readQuery(sp);

  if (!query) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
          Search
        </h1>
        <p className="mt-4 text-sm text-stone-500">
          Type a query in the header to find products.
        </p>
        <SearchForm initialQuery="" />
      </main>
    );
  }

  // Min-length guard matches the data layer's tokenize() (drops < 2 chars).
  if (query.length < 2) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
          Keep typing…
        </h1>
        <p className="mt-4 text-sm text-stone-500">
          Search needs at least 2 characters.
        </p>
        <SearchForm initialQuery={query} />
      </main>
    );
  }

  const supabase = createPublicClient();
  const result = await readOrEmpty(
    "storefront-search",
    () => searchProductCards(supabase, query, { limit: 36 }),
    { query, expanded: "", items: [] },
  );

  // Log every query — including zero-result ones — for the admin
  // dashboard's "zero-result searches" widget. `after()` runs post-
  // response so the user doesn't pay for the insert latency.
  after(() => logSearch(result.query, result.items.length));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
          Search results
        </h1>
        <p className="text-sm text-stone-500">
          {result.items.length > 0
            ? `${result.items.length} result${result.items.length === 1 ? "" : "s"} for `
            : `No results for `}
          <span className="font-mono text-bark-900">&ldquo;{query}&rdquo;</span>
        </p>
      </header>

      <div className="mt-6">
        <SearchForm initialQuery={query} />
      </div>

      <div className="mt-8">
        {result.items.length > 0 ? (
          <ProductCardGrid products={result.items} />
        ) : (
          <div className="rounded-lg border border-husk-200 bg-paper-0 p-8 text-center">
            <p className="text-base text-bark-900">
              Nothing matched <strong>&ldquo;{query}&rdquo;</strong>.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Try fewer words, or check your spelling. You can also{" "}
              <Link
                href="/"
                className="text-teal-800 underline underline-offset-2 hover:text-teal-900"
              >
                browse the catalog
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Plain HTML form — no client JS needed. GET-submits to /search?q=… so
 * results are shareable, server-rendered, and crawlable by future search
 * tooling. Reused at the top of every search-result page.
 */
function SearchForm({ initialQuery }: { initialQuery: string }) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="flex w-full max-w-xl gap-2"
    >
      <input
        type="search"
        name="q"
        defaultValue={initialQuery}
        placeholder="Search products…"
        aria-label="Search products"
        maxLength={MAX_QUERY_LEN}
        className="h-10 w-full min-w-0 rounded-md border border-husk-200 bg-paper-0 px-3 text-base text-bark-900 outline-none placeholder:text-stone-400 focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30 md:text-sm"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-teal-800 px-4 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
      >
        Search
      </button>
    </form>
  );
}
