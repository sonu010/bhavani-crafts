import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getProductForEditing,
  listTagsForProduct,
} from "@/lib/db/admin/products";
import {
  getProductAttributes,
  listApplicableAttributes,
} from "@/lib/db/attributes";
import { listProductImages } from "@/lib/db/admin/images";
import { getVariantsBundle } from "@/lib/db/admin/variants";
import { getCategoryTree } from "@/lib/db/categories";
import { perfStart } from "@/lib/perf";
import { ProductEditor } from "./product-editor";
import { pickTab } from "./tabs-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit product — Bhavani Crafts",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin product editor. Renders the tabbed shell; content lands in
 * T11–T17 (per-tab). The `?tab=` query param drives which tab is
 * active and is the source of truth — server component reads it for
 * the initial value, the client editor pushes via router.replace.
 *
 * `?back=` (optional) is the URL the breadcrumb's "Products" link
 * returns to. The products-list row link sets it to preserve the
 * user's prior filters; falls back to the list default.
 */
export default async function ProductEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; back?: string | string[] }>;
}) {
  const t = perfStart("/admin/products/[id]/edit");
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  // Belt + suspenders: reject malformed ids early so a bogus URL hits
  // 404 instead of a Postgres "invalid input syntax for type uuid".
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const { admin } = await requireAdminContext();
  t.mark("auth");

  // Two-stage fetch: the product first (we need category_id to scope
  // applicable attribute definitions), then everything else in
  // parallel. Stage-2 queries don't depend on each other so the cost
  // is bounded by the slowest single round-trip.
  const product = await getProductForEditing(admin, id);
  if (!product) {
    notFound();
  }

  const [
    categoryTree,
    allTagsRes,
    currentTags,
    attributeDefs,
    attributeValues,
    variantsBundle,
    images,
  ] = await Promise.all([
    getCategoryTree(admin),
    admin
      .from("tags")
      .select("slug, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    listTagsForProduct(admin, id),
    listApplicableAttributes(admin, product.category_id),
    getProductAttributes(admin, id),
    getVariantsBundle(admin, id),
    listProductImages(admin, id),
  ]);
  if (allTagsRes.error) {
    throw new Error(`load tags: ${allTagsRes.error.message}`);
  }
  const allTags = allTagsRes.data ?? [];
  t.mark("fetch");
  t.end();

  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = pickTab(tabRaw ?? null);
  const backRaw = Array.isArray(sp.back) ? sp.back[0] : sp.back;
  // Only honor `back` when it's a same-site absolute path — same guard
  // as /login uses against open-redirect targets.
  const backHref =
    typeof backRaw === "string" && backRaw.startsWith("/") && !backRaw.startsWith("//")
      ? backRaw
      : "/admin/products";

  return (
    <ProductEditor
      product={product}
      categoryTree={categoryTree}
      allTags={allTags}
      currentTags={currentTags}
      attributeDefs={attributeDefs}
      attributeValues={attributeValues}
      variantsBundle={variantsBundle}
      images={images}
      initialTab={initialTab}
      backHref={backHref}
    />
  );
}
