import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { listTopLevelCategories } from "@/lib/db/categories";
import { SiteHeader } from "./site-header";

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
export const metadata = {
  // Storefront is indexable (the opposite of admin's noindex).
  title: "Bhavani Crafts — craft supplies in Hyderabad",
};

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
  const categories = await getNavCategories();

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader categories={categories} />
      <div className="flex-1">{children}</div>
      {/* Footer slot — P3-T09 mounts <SiteFooter/> here. */}
    </div>
  );
}
