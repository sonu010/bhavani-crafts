import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { listTopLevelCategories } from "@/lib/db/categories";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "@/components/storefront/site-footer";
import { CartDrawer } from "@/components/storefront/cart-drawer";

/**
 * Storefront layout — the chrome every public page renders inside.
 * Distinct from the admin `(shell)` layout: indexable, no auth, no
 * service-role anything.
 *
 * The nav-category read runs on every storefront page, so it's cached
 * with the `categories` tag (admin category mutations call
 * `updateTag('categories')` and flush it) per the performance contract
 * in architecture/performance.md. ISR revalidate is a backstop for the
 * rare case where a tag flush is missed.
 */
// No metadata override at this layer — the home page title +
// description come from the root layout's `title.default` (Next 16
// does not apply the title.template to a default). Per-page
// generateMetadata for PDP/category/search inherits the template
// from root so each becomes "X — Bhavani Crafts". Setting a title
// here (even `{ absolute }`) would shadow the template for every
// descendant — we did that once and lost the suffix on every PDP.

const getNavCategories = unstable_cache(
  async (): Promise<Array<{ slug: string; name: string }>> => {
    const supabase = createPublicClient();
    const cats = await listTopLevelCategories(supabase);
    return cats.map((c) => ({ slug: c.slug, name: c.name }));
  },
  ["nav-categories"],
  { tags: ["categories"], revalidate: 300 },
);

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await readOrEmpty("nav-categories", getNavCategories, []);

  return (
    <div className="flex min-h-full flex-col">
      {/* Skip-link for keyboard + screen-reader users. Hidden visually
          until focused (Tab on a fresh page); then it lets you jump
          past the header nav straight to the page content. Targets
          `#main-content` (wrapper around `children`). WCAG 2.4.1. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-teal-800 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-paper-0 focus:outline-2 focus:outline-offset-2 focus:outline-teal-800"
      >
        Skip to content
      </a>
      <SiteHeader categories={categories} />
      <div id="main-content" className="flex-1">
        {children}
      </div>
      <SiteFooter categories={categories} />
      {/* Cart drawer — mounted once per layout so any component (header
          cart button, PDP add-to-cart) can open it via the store's
          `openCart()` action without prop drilling. */}
      <CartDrawer />
      {/* Storefront toasts (e.g. copy-address, newsletter). Admin has its
          own Toaster in the (shell) layout. */}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
