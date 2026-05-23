"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminFilterOptions } from "@/lib/db/admin/products";

type StockOpt = "" | "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "unknown";

const SELECT_BASE_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30 sm:w-auto";

const DEBOUNCE_MS = 300;

/**
 * URL is the state. Each control reads from useSearchParams and writes
 * via router.replace.
 *
 * Layout pivots at sm (640px):
 *   - mobile (<sm): search inline + a single "Filters" pill that opens
 *     a Sheet with category / stock / tags. Reclaims the ~150px of
 *     vertical real estate the old stacked-controls layout ate.
 *   - sm+: full inline layout (search + selects + tags dropdown).
 *
 * The Sheet's controls write to the URL on change (same handler as
 * inline controls); no Apply step. Status chips live one row below
 * the search row and remain horizontal-scrolled on mobile.
 */
export function FilterBar({ options }: { options: AdminFilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

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
      next.delete("cursor");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/admin/products?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Debounced search input — uncontrolled.
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

  // Count active filters (category + stock + tags). Search isn't included
  // because it's always visible inline; the pill counts the things that
  // would otherwise be invisible until the Sheet opens.
  const advancedActiveCount =
    (categoryId ? 1 : 0) + (stock ? 1 : 0) + selectedTags.size;
  const anyActive = q || advancedActiveCount > 0;

  // ─── Shared controls (rendered in two contexts: inline on sm+, inside the Sheet on mobile)
  const categorySelect = (
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
  );

  const stockSelect = (
    <select
      aria-label="Filter by stock"
      className={SELECT_BASE_CLASS}
      value={stock}
      onChange={(e) => pushFilters({ stock: (e.target.value as StockOpt) || null })}
    >
      <option value="">Any stock</option>
      <option value="in_stock">In stock</option>
      <option value="low_stock">Low stock</option>
      <option value="out_of_stock">Out of stock</option>
      <option value="made_to_order">Made to order</option>
      <option value="unknown">Unknown</option>
    </select>
  );

  const tagsDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full justify-between gap-2 sm:w-auto"
          >
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
  );

  return (
    <div className="space-y-2">
      {/* Row 1: search + (mobile-only) Filters trigger */}
      <div className="flex items-center gap-2">
        <Input
          key={q}
          aria-label="Search products"
          defaultValue={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, slug, SKU…"
          className="flex-1"
        />

        {/* Mobile-only Filters sheet trigger */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            aria-label="Open filters"
            className="sm:hidden"
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-2"
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden xs:inline">Filters</span>
                {advancedActiveCount > 0 ? (
                  <span
                    aria-label={`${advancedActiveCount} active`}
                    className="grid size-5 place-items-center rounded-full bg-teal-800 font-mono text-[10px] tabular-nums text-cream-50"
                  >
                    {advancedActiveCount}
                  </span>
                ) : null}
              </Button>
            }
          />
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-stone-500">
                  Category
                </label>
                {categorySelect}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-stone-500">
                  Stock
                </label>
                {stockSelect}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-stone-500">
                  Tags
                </label>
                {tagsDropdown}
              </div>
              {anyActive ? (
                <Link
                  href="/admin/products"
                  onClick={() => setSheetOpen(false)}
                  className="inline-flex items-center gap-1 text-sm text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
                >
                  <X className="size-3.5" />
                  Clear filters
                </Link>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Row 2: inline filters (sm+ only) */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {categorySelect}
        {stockSelect}
        {tagsDropdown}
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
    </div>
  );
}
