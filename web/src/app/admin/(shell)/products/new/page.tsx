import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/db/admin-context";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New product — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * /admin/products/new — server-action-first new-product flow.
 *
 * The page itself doesn't render anything; it inserts an empty draft
 * product (status='draft', is_published=false) and redirects to the
 * editor for that product. This keeps "unsaved new product" state off
 * the client entirely — the draft is persisted on entry, then edited
 * like any existing row.
 *
 * Slug + SKU are temporary placeholders the owner overwrites in the
 * General tab. Both are dated + randomized so the UNIQUE constraints
 * never trip across concurrent draft creates.
 */
function randSlugSuffix(): string {
  // 6 chars of base36 randomness — collision probability is fine for
  // single-owner usage; the UNIQUE on slug catches the rare clash and
  // the user retries with the bumped timestamp.
  return Math.random().toString(36).slice(2, 8);
}

export default async function NewProductPage() {
  const { admin, user } = await requireAdminContext();

  const ts = Date.now();
  const suffix = randSlugSuffix();
  const slug = `new-${ts}-${suffix}`;
  const sku = `DRAFT-${ts}-${suffix}`;

  const { data, error } = await admin
    .from("products")
    .insert({
      sku,
      slug,
      name: "Untitled product",
      stock_status: "unknown",
      review_status: "draft",
      is_published: false,
      source: "manual",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `failed to create draft product: ${error?.message ?? "no data"}`,
    );
  }

  redirect(`/admin/products/${data.id}/edit?tab=general`);
}
