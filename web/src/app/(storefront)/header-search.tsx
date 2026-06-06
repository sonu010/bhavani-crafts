"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Header search trigger (P3.5 polish). Clicking the magnifying-glass
 * icon opens a Sheet from the top with a focused input; submitting
 * navigates to /search?q=… and closes the sheet.
 *
 * Before: the icon was a plain <Link href="/search"> that dropped you
 * on the search landing page where you THEN typed. Two hops, two page
 * loads, lost the current page context. The Sheet collapses that to a
 * single in-place interaction — closer to how every modern storefront
 * (Apple, IKEA, Shopify-default themes) handles it.
 *
 * The submit goes through a real GET form so the resulting URL is
 * shareable and server-rendered. No client-side search-as-you-type at
 * MVP — Postgres trigram cost makes it premature optimization.
 */
const MAX_QUERY_LEN = 120;

export function HeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim().slice(0, MAX_QUERY_LEN);
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-9 items-center justify-center rounded-md text-bark-900 hover:bg-husk-100"
        aria-label="Search"
      >
        <Search className="size-5" />
      </SheetTrigger>
      <SheetContent side="top" className="px-6 pb-8 pt-6">
        <SheetHeader>
          <SheetTitle className="sr-only">Search products</SheetTitle>
        </SheetHeader>
        <form
          role="search"
          onSubmit={onSubmit}
          className="mx-auto flex w-full max-w-2xl gap-2"
        >
          <input
            // autoFocus is fine inside a Sheet — focus moves IN when the
            // sheet opens (which is itself a user gesture).
            autoFocus
            type="search"
            name="q"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Brass, resin, brushes…"
            aria-label="Search products"
            maxLength={MAX_QUERY_LEN}
            className="h-11 w-full min-w-0 rounded-md border border-husk-200 bg-paper-0 px-3 text-base text-bark-900 outline-none placeholder:text-stone-400 focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30"
          />
          <button
            type="submit"
            disabled={value.trim().length === 0}
            className="shrink-0 rounded-md bg-teal-800 px-5 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            Search
          </button>
        </form>
        <p className="mx-auto mt-3 max-w-2xl text-xs text-stone-500">
          Press <kbd className="rounded border border-husk-200 bg-husk-100 px-1 font-mono text-[10px]">Esc</kbd> to close.
        </p>
      </SheetContent>
    </Sheet>
  );
}
