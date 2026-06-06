"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CategoryFilters } from "./data";

/**
 * Category filter sidebar (P3-T11). Price + stock filters, URL-driven so
 * they're shareable and server-rendered.
 *
 * IMPORTANT: this writes to the URL ONLY from user event handlers
 * (onChange / onClick) — never from a `useEffect` that depends on
 * `searchParams`. That effect+searchParams combination is the infinite
 * router.replace loop we hit on the admin filter bars (see SESSION-RESUME
 * "Admin filter-bar infinite loop"). Reading from `searchParams` is fine;
 * auto-firing a navigation off it is not.
 */
const PRICE_DEBOUNCE_MS = 350;
const INPUT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2.5 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

export function FiltersSidebar({ initial }: { initial: CategoryFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const min = searchParams.get("min") ?? "";
  const max = searchParams.get("max") ?? "";
  const stock = searchParams.get("stock") ?? "";

  const pushFilters = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPriceChange = useCallback(
    (key: "min" | "max", value: string) => {
      if (priceTimer.current) clearTimeout(priceTimer.current);
      priceTimer.current = setTimeout(() => {
        const n = value.trim();
        pushFilters({ [key]: n === "" ? null : String(Math.max(0, Math.floor(Number(n) || 0))) });
      }, PRICE_DEBOUNCE_MS);
    },
    [pushFilters],
  );

  const activeCount =
    (initial.minPriceInr !== undefined ? 1 : 0) +
    (initial.maxPriceInr !== undefined ? 1 : 0) +
    (initial.stockStatus !== undefined ? 1 : 0);

  const controls = (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Price (₹)
        </legend>
        <div className="flex items-center gap-2">
          {/* key={} remounts the input when the URL value changes (e.g.
              Clear), so the uncontrolled defaultValue refreshes. */}
          <input
            key={`min-${min}`}
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={min}
            placeholder="Min"
            aria-label="Minimum price"
            className={INPUT_CLASS}
            onChange={(e) => onPriceChange("min", e.target.value)}
          />
          <span className="text-stone-400">–</span>
          <input
            key={`max-${max}`}
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={max}
            placeholder="Max"
            aria-label="Maximum price"
            className={INPUT_CLASS}
            onChange={(e) => onPriceChange("max", e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Availability
        </legend>
        <select
          aria-label="Filter by stock"
          className={INPUT_CLASS}
          value={stock}
          onChange={(e) => pushFilters({ stock: e.target.value || null })}
        >
          <option value="">Any availability</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </fieldset>

      {activeCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => pushFilters({ min: null, max: null, stock: null })}
        >
          <X className="size-3.5" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Desktop: inline sidebar */}
      <aside className="hidden lg:block">
        <h2 className="mb-4 text-sm font-semibold text-bark-900">Filters</h2>
        {controls}
      </aside>

      {/* Mobile: a Sheet behind a "Filters" trigger with an active badge */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal className="size-3.5" />
                Filters
                {activeCount > 0 ? (
                  <span className="ml-1 rounded-full bg-teal-800 px-1.5 text-[10px] font-medium text-paper-0">
                    {activeCount}
                  </span>
                ) : null}
              </Button>
            }
          />
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{controls}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
