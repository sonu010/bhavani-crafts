import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getProductForEditing } from "@/lib/db/admin/products";
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

  // Full editable shape — the General tab's form needs every field;
  // other tabs ignore the extras. One query is faster than gating per
  // tab with its own fetch.
  const product = await getProductForEditing(admin, id);
  t.mark("fetch");
  t.end();

  if (!product) {
    notFound();
  }

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
      initialTab={initialTab}
      backHref={backHref}
    />
  );
}
