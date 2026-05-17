---
id: P2-T17
phase: 2
title: Product editor — publish + preview
status: not_started
depends_on: [P2-T11]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Publish tab shows a pre-flight checklist that mirrors the `launch-blockers.ts` SQL checks (every published product has ≥1 licensed image; no broken license states; review_status aligned), a "Preview as anonymous" link that opens the storefront PDP via a signed preview token (works even when `is_published=false`), and the Publish / Unpublish buttons. The publish action sets `is_published=true` and `review_status='published'`; unpublish sets `is_published=false` and `review_status='ready_to_publish'`. The DB trigger from 0004 enforces consistency.

# Prerequisites (read first)

- [`web/supabase/migrations/0004_ops_tables.sql`](../../../web/supabase/migrations/0004_ops_tables.sql) — the `products_publish_state_consistency` trigger already exists; don't reimplement
- [`web/scripts/launch-blockers.ts`](../../../web/scripts/launch-blockers.ts) — the 12 checks; mirror them per-product in the pre-flight panel
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) — publish revalidation map (full set: `revalidateTag('products')`, `revalidatePath('/p/' + slug)`, `revalidatePath('/c/' + categorySlug)`, and `revalidatePath('/')` if is_featured)
- [P2-T15](P2-T15-product-editor-images-upload.md) — license-status defaults; this is where the pre-flight blocks publish until licenses are verified

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/publish.tsx` (modified) — server component renders `<PreflightChecks>` + `<PublishButtons>` + `<PreviewLink>`.
- `web/src/app/admin/products/[id]/edit/_publish/preflight-checks.tsx` (new) — server component; runs the per-product version of the launch-blockers SQL.
- `web/src/app/admin/products/[id]/edit/_publish/publish-buttons.tsx` (new) — client; renders Publish / Unpublish / Schedule (deferred).
- `web/src/app/admin/products/[id]/edit/actions.ts` (modified) — `publishProduct(id)`, `unpublishProduct(id)`, `generatePreviewLink(id)`.
- `web/src/app/p/[slug]/page.tsx` (modified — storefront PDP from Phase 3, if it exists yet; if not, scope this task to "generate the token and document the consumer"). The PDP server component accepts `?preview=<token>` and, if valid, surfaces the product even when `is_published=false`.
- `web/src/lib/db/admin/products.ts` (modified) — `runProductPreflight(supabase, id)`, `publishProduct(supabase, id)`, `unpublishProduct(supabase, id)`.
- `web/src/lib/auth/preview-token.ts` (new) — `signPreviewToken(productId)` + `verifyPreviewToken(token, productId)`. JWT with `iss='admin-preview'`, `exp=now+15min`, signed with a dedicated `PREVIEW_TOKEN_SECRET` env var.
- `web/__tests__/db/admin/publish.test.ts` (new)

# Implementation notes

**Pre-flight checks (per-product version of `launch-blockers.ts`):**

| Check | Source | Blocks publish? |
|---|---|---|
| ≥ 1 image with `license_status IN ('owned','licensed','public_domain')` | `product_images` | YES |
| No image with `license_status IN ('disputed','removed')` | `product_images` | YES |
| Category set | `products.category_id IS NOT NULL` | WARN |
| Description present | `products.description` non-empty | WARN |
| `base_price_inr` set | non-null | YES |
| Alt text on all images | `product_images.alt` non-empty | WARN |
| If has variants, exactly one is_default | `product_variants` | YES |

Render as a checklist; passing rows show a moss-600 check, blocking rows show brick-600 X, warnings show saffron-500 alert. The Publish button is disabled if any blocking row fails; it activates with warnings (owner can publish with warnings).

**Publish action.**

```ts
export async function publishProduct(supabase: SC, id: string) {
  const preflight = await runProductPreflight(supabase, id);
  if (preflight.blockingFailures.length > 0) {
    throw new Error(`preflight_failed: ${preflight.blockingFailures.join(",")}`);
  }
  const { data: before } = await supabase.from("products").select("*").eq("id", id).single();
  const { data: after } = await supabase
    .from("products")
    .update({ is_published: true, review_status: "published" })
    .eq("id", id)
    .select("*")
    .single();
  // audit + revalidate
}
```

The `products_publish_state_consistency` trigger (0004) keeps `is_published` and `review_status` aligned at the DB level; the application layer enforces the right combinations:

- Publish: `is_published=true, review_status='published'`
- Unpublish: `is_published=false, review_status='ready_to_publish'`
- Archive (separate action, deferred): `is_published=false, review_status='archived'`

**Preview link.** Owner clicks "Preview as anonymous" → server action generates a signed JWT → opens `https://<host>/p/<slug>?preview=<token>` in a new tab. The storefront PDP (Phase 3) checks `searchParams.preview` — if a valid token for this product, render even when `is_published=false`. Token TTL: 15 minutes.

**`PREVIEW_TOKEN_SECRET`.** New env var; throw at module load if missing in production. Add to `.env.example`.

**Revalidation on publish/unpublish.** Per [caching-and-revalidation.md mutation map](../../architecture/caching-and-revalidation.md):
- `revalidateTag('products')`
- `revalidatePath('/p/' + slug)` (old slug if changed)
- `revalidatePath('/c/' + categorySlug)`
- If `is_featured`: `revalidatePath('/')`

**Audit log.** `product.publish` / `product.unpublish` with `before_json: { is_published, review_status }`, `after_json: { is_published, review_status }`.

**Scheduled publish — deferred.** A "Schedule for later" button is visible but disabled with a "Coming soon" tooltip. Real implementation lands as part of a future phase when the cron infrastructure exists.

# Acceptance criteria

- [ ] Pre-flight panel runs all checks; blocking failures disable the Publish button.
- [ ] Publish action toggles `is_published=true` + `review_status='published'`; audit log + revalidation happen.
- [ ] Unpublish reverses; audit log + revalidation.
- [ ] Preview link opens `/p/<slug>?preview=<token>` in a new tab; storefront renders even when unpublished.
- [ ] Preview token expires after 15 minutes; expired token falls back to "not found" or the public response (per the storefront's existing behavior).
- [ ] Publish without a licensed image → action throws `preflight_failed` even if client somehow bypassed the disabled button (server-side enforcement).
- [ ] Trigger conflict (e.g. someone manually `UPDATE products SET review_status='published' WHERE is_published=false`) — trigger blocks; integration test confirms.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/publish.test.ts`, `pnpm launch-blockers` all green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/publish.test.ts
pnpm launch-blockers
pnpm dev &
sleep 4
# Editor → Publish tab on a fresh product
# 1. Pre-flight shows blocking ❌ for "≥ 1 licensed image" → Publish disabled
# 2. Upload + verify license → pre-flight goes green → Publish enabled
# 3. Click Publish → toast "Published" → storefront /p/<slug> renders publicly
# 4. Click "Preview as anonymous" on an unpublished product → new tab → /p/<slug>?preview=...
# 5. Click Unpublish → storefront returns 404 immediately
```

# Dependencies added

- `jose` — JWT signing for preview tokens (avoid jsonwebtoken; jose is Edge-runtime compatible)

# Notes for next agent

(empty)
