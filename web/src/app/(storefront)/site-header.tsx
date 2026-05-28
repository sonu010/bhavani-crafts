"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Storefront top nav. Sticky; brand wordmark + top-category links +
 * search/cart triggers. Collapses to a hamburger Sheet on mobile.
 *
 * Search + cart panels land in their own tasks (P3-T18 search, P3-T20
 * cart drawer). For now the search trigger routes to /search and the
 * cart trigger is a placeholder button — wired through once those
 * panels exist. The cart count badge arrives with the store (P3-T21).
 */
export function SiteHeader({
  categories,
}: {
  categories: Array<{ slug: string; name: string }>;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-husk-200 bg-paper-0/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
        {/* Mobile hamburger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-bark-900 hover:bg-husk-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-display text-xl text-bark-900">
                Bhavani <em className="not-italic text-clay-600">Crafts</em>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              <Link
                href="/search"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-bark-900 hover:bg-husk-100"
              >
                Search
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/c/${c.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-2 py-2 text-sm text-bark-900 hover:bg-husk-100"
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link
          href="/"
          className="font-display text-xl text-bark-900 sm:text-2xl"
        >
          Bhavani <em className="italic text-clay-600">Crafts</em>
        </Link>

        {/* Desktop category nav */}
        <nav className="ml-6 hidden items-center gap-5 lg:flex">
          {categories.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/c/${c.slug}`}
              className="text-sm text-stone-600 underline-offset-4 transition-colors hover:text-bark-900 hover:underline"
            >
              {c.name}
            </Link>
          ))}
        </nav>

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-md text-bark-900 hover:bg-husk-100"
          >
            <Search className="size-5" />
          </Link>
          {/* Cart trigger — opens the drawer once P3-T20 lands; the
             count badge binds to the store from P3-T21. */}
          <button
            type="button"
            aria-label="Cart"
            className="inline-flex size-9 items-center justify-center rounded-md text-bark-900 hover:bg-husk-100"
          >
            <ShoppingBag className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
