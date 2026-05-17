"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ADMIN_NAV, isActiveNav } from "./nav-tree";
import { UserMenu } from "./user-menu";

/**
 * Admin chrome — sidebar (≥md) + top bar + content slot.
 *
 * Mobile pattern (locked in SESSION-RESUME §"Admin mobile shape"): the
 * sidebar collapses, a hamburger appears in the top bar, and a shadcn
 * Sheet slides in from the left with the same nav.
 */
export function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email: string; role: string };
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-husk-200 bg-cream-50 md:flex md:flex-col">
        <div className="flex h-14 items-center px-4">
          <Link href="/admin" className="font-display text-lg italic text-clay-600">
            Bhavani Crafts
          </Link>
        </div>
        <nav className="flex-1 px-2 py-2">
          <ul className="space-y-1">
            {ADMIN_NAV.map((item) => {
              const active = isActiveNav(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors " +
                      (active
                        ? "border-l-[3px] border-teal-800 bg-husk-100 text-bark-900"
                        : "text-stone-500 hover:bg-husk-100 hover:text-bark-900")
                    }
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main column. min-w-0 lets this flex child shrink below its
         intrinsic content width — without it, any wide descendant
         (long category names, long SKUs, etc.) pushes the page past
         the viewport and the body picks up a horizontal scrollbar. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-husk-200 bg-paper-0 px-3 sm:px-4">
          {/* Left cluster: hamburger + brand wordmark. min-w-0 so the
             wordmark can truncate instead of pushing past the user
             menu. */}
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile hamburger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger
                aria-label="Open navigation"
                className="md:hidden"
                render={
                  <Button variant="ghost" size="icon">
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-husk-200 px-4 py-3">
                  <SheetTitle className="font-display italic text-clay-600">
                    Bhavani Crafts
                  </SheetTitle>
                </SheetHeader>
                <nav className="px-2 py-2">
                  <ul className="space-y-1">
                    {ADMIN_NAV.map((item) => {
                      const active = isActiveNav(item.href, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setSheetOpen(false)}
                            className={
                              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors " +
                              (active
                                ? "border-l-[3px] border-teal-800 bg-husk-100 text-bark-900"
                                : "text-stone-500 hover:bg-husk-100 hover:text-bark-900")
                            }
                          >
                            <item.icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
            <span className="truncate font-display italic text-clay-600 md:hidden">
              Bhavani Crafts
            </span>
          </div>

          <UserMenu email={user.email} role={user.role} />
        </header>

        {/* min-w-0 again — `<main>` is the flex-col child that
           actually holds page content, and the same shrink rule
           applies. */}
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
