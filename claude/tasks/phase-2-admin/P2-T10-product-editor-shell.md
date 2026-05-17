---
id: P2-T10
phase: 2
title: Product editor shell
status: not_started
depends_on: [P2-T07]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/products/:id/edit` and `/admin/products/new` render a tabbed editor with six tabs: General, Category, Attributes, Variants, Images, Publish. Tabs are URL-routed (`?tab=general`) so deep links work. Unsaved-changes guard prompts on tab switch + navigation. Each tab's content lands in a follow-up task (T11–T17); this task only ships the shell + the URL routing + the dirty-state guard + the breadcrumb.

# Prerequisites (read first)

- [`web/src/components/ui/tabs.tsx`](../../../web/src/components/ui/tabs.tsx) — shadcn `Tabs` primitive already installed
- [`web/src/lib/db/products.ts`](../../../web/src/lib/db/products.ts) — `getProductBySlug(supabase, slug)`; for `/edit` we need an `getProductById` variant
- [P2-T07](P2-T07-products-list-cursor-paginated.md) — the list links into this editor

# Files to touch

- `web/src/app/admin/products/[id]/edit/page.tsx` (new) — server component. Fetches product by id (or null if id === 'new'). Renders `<ProductEditor>`.
- `web/src/app/admin/products/[id]/edit/product-editor.tsx` (new) — client component. Shadcn `Tabs` with six tabs. Active tab driven by `?tab=` search param.
- `web/src/app/admin/products/[id]/edit/_tabs/general.tsx` (new) — empty shell; lands in P2-T11.
- `web/src/app/admin/products/[id]/edit/_tabs/category.tsx` (new) — empty shell; lands in P2-T12.
- `web/src/app/admin/products/[id]/edit/_tabs/attributes.tsx` (new) — empty shell; lands in P2-T13.
- `web/src/app/admin/products/[id]/edit/_tabs/variants.tsx` (new) — empty shell; lands in P2-T14.
- `web/src/app/admin/products/[id]/edit/_tabs/images.tsx` (new) — empty shell; lands in P2-T15.
- `web/src/app/admin/products/[id]/edit/_tabs/publish.tsx` (new) — empty shell; lands in P2-T17.
- `web/src/app/admin/products/[id]/edit/use-dirty-guard.tsx` (new) — custom hook. Wraps `useEffect` on `beforeunload` and a custom `useRouter` interceptor. Returns `{ isDirty, markDirty, markClean }`.
- `web/src/lib/db/products.ts` (modified) — add `getProductById(supabase, id)` adjacent to the existing `getProductBySlug`. Service-role variant needed for unpublished-row fetch when the cookie-bound admin client is used by an admin profile.
- `web/__tests__/db/products-by-id.test.ts` (new)

# Implementation notes

**Route shape.** `/admin/products/:id/edit` for existing; `/admin/products/new` is a thin redirect that POSTs an empty draft and then redirects to `/admin/products/<new-id>/edit?tab=general`. New-product creation is server-action-first; we never carry "unsaved new product" state — the draft is persisted on entry.

**Six tabs in this order:** General, Category, Attributes, Variants, Images, Publish. The order matches typical edit flow — generic fields first, taxonomy second, then variants, then media, then the publish gate last.

**URL-routed tab.** `<Tabs value={tab} onValueChange={(v) => router.replace('?tab=' + v)}>`. Server component reads `searchParams.tab` for the initial value; if absent, default to `general`. Deep-linking and back-button work without code.

**Dirty-state guard.**

```ts
useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

For client-side tab switches: don't intercept (since tab content auto-saves in T11+). For navigation away (sidebar click, top-level link), use a Radix `<AlertDialog>` triggered from the layout via a context. Keep the interception logic local to the editor; don't pollute the admin layout.

**Breadcrumb.** Above the tabs: `Products / <Product Name>`. The product name link goes back to `/admin/products` with the user's prior filters preserved via `?back=` set when they clicked through. If `?back=` is absent, fall back to the products-list default.

**`getProductById` shape.** Mirror `getProductBySlug` but query by primary key. Joined with images, variants, tags, category. RLS handles whether unpublished rows are visible — for admin contexts, the cookie-bound client (admin role) sees them.

**Read-only fallback.** If the route is hit by a `viewer` role somehow (shouldn't be — `requireRole(s, 'admin')` in the layout blocks), render the form fields disabled. Belt + suspenders.

# Acceptance criteria

- [ ] `/admin/products/:id/edit` renders a tabbed editor with all six tabs visible.
- [ ] `?tab=images` deep-link selects the Images tab on initial render.
- [ ] Switching tabs updates the URL via `router.replace`.
- [ ] `/admin/products/new` creates a draft product, redirects to `/admin/products/<new-id>/edit?tab=general`.
- [ ] Marking a tab dirty (`markDirty()` from any child) wires `beforeunload` confirm; reload prompts.
- [ ] Breadcrumb shows `Products / <name>`; product link returns to `/admin/products` with prior filters preserved when present.
- [ ] `getProductById(supabase, id)` integration test passes; returns full joined shape.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm exec vitest run __tests__/db/products-by-id.test.ts

pnpm dev &
sleep 4
# 1. Visit /admin/products → click any row → /admin/products/<id>/edit opens
# 2. URL has ?tab=general; switching tabs updates URL
# 3. Visit /admin/products/new → redirects to /admin/products/<new-uuid>/edit
# 4. (After T11 lands) edit a field → tab becomes dirty → reload page → browser confirm
```

# Dependencies added

None.

# Notes for next agent

(empty)
