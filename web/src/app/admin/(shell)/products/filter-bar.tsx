"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { AdminFilterOptions } from "@/lib/db/admin/products";

type StockOpt = "" | "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "unknown";

const SELECT_BASE_CLASS =
  "h-9 rounded-md border border-husk-200 bg-paper-0 px-2 text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

const DEBOUNCE_MS = 300;

/**
 * URL is the state. Each control reads the current value from
 * useSearchParams and writes via router.replace (no history spam, no
 * client React state for filter values — server component re-renders on
 * URL change with the fresh filter applied).
 *
 * Search box is debounced 300ms; everything else updates immediately.
 */
export function FilterBar({ options }: { options: AdminFilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? "";
  const stock = (searchParams.get("stock") ?? "") as StockOpt;
  const selectedTags = useMemo(() => {
    const raw = searchParams.get("tags");
    return new Set(raw ? raw.split(",").filter(Boolean) : []);
  }, [searchParams]);

  const pushFilters = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      // Always clear cursor when filters change — paging mid-set is undefined.
      next.delete("cursor");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/admin/products?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Debounced search input — uncontrolled. The input owns its own DOM
  // value; we push to URL after DEBOUNCE_MS of idle typing. When the URL
  // `q` changes externally (Clear filters, back button), we remount the
  // input via `key={q}` to reset its value.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = useCallback(
    (value: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        pushFilters({ q: value.trim() || null });
      }, DEBOUNCE_MS);
    },
    [pushFilters],
  );

  const toggleTag = useCallback(
    (slug: string, checked: boolean) => {
      const next = new Set(selectedTags);
      if (checked) next.add(slug);
      else next.delete(slug);
      pushFilters({ tags: next.size > 0 ? [...next].sort().join(",") : null });
    },
    [pushFilters, selectedTags],
  );

  const anyActive =
    q || categoryId || stock || selectedTags.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="min-w-[200px] flex-1 md:max-w-xs">
        <Input
          key={q}
          aria-label="Search products"
          defaultValue={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, slug, SKU…"
        />
      </div>

      {/* Category */}
      <select
        aria-label="Filter by category"
        className={SELECT_BASE_CLASS}
        value={categoryId}
        onChange={(e) => pushFilters({ category: e.target.value || null })}
      >
        <option value="">All categories</option>
        {options.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Stock */}
      <select
        aria-label="Filter by stock"
        className={SELECT_BASE_CLASS}
        value={stock}
        onChange={(e) =>
          pushFilters({ stock: (e.target.value as StockOpt) || null })
        }
      >
        <option value="">Any stock</option>
        <option value="in_stock">In stock</option>
        <option value="low_stock">Low stock</option>
        <option value="out_of_stock">Out of stock</option>
        <option value="made_to_order">Made to order</option>
        <option value="unknown">Unknown</option>
      </select>

      {/* Tags (multi) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="gap-2">
              <span>
                Tags
                {selectedTags.size > 0 ? (
                  <span className="ml-1 font-mono text-xs tabular-nums text-teal-800">
                    {selectedTags.size}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-auto">
          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-stone-500">
            Match ANY of the selected
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.tags.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-stone-500">No tags yet</div>
          ) : (
            options.tags.map((t) => (
              <DropdownMenuCheckboxItem
                key={t.slug}
                checked={selectedTags.has(t.slug)}
                onCheckedChange={(c) => toggleTag(t.slug, c)}
              >
                {t.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {anyActive ? (
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1 text-sm text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <X className="size-3.5" />
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
