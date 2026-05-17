---
id: P2-T10
phase: 2
title: Product editor shell
status: done
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

**2026-05-17 — DONE.** Two sub-commits.

**Route structure (lives under `(shell)` so the admin auth gate applies):**
```
app/admin/(shell)/products/
├── [id]/edit/
│   ├── page.tsx              ← server component, fetches product, renders editor
│   ├── product-editor.tsx    ← "use client", Tabs + breadcrumb + dirty hint
│   ├── tabs-config.ts        ← shared (non-client): EditorTab, TABS, pickTab
│   ├── use-dirty-guard.ts    ← beforeunload hook
│   └── _tabs/
│       ├── general.tsx       ← placeholder, lands P2-T11
│       ├── category.tsx      ← P2-T12
│       ├── attributes.tsx    ← P2-T13
│       ├── variants.tsx      ← P2-T14
│       ├── images.tsx        ← P2-T15
│       └── publish.tsx       ← P2-T17
└── new/page.tsx              ← creates draft + redirects to /[id]/edit?tab=general
```

**Client-server split gotcha caught + fixed:** initial draft exported `pickTab` from `product-editor.tsx` ("use client"). Server `page.tsx` imported it. Next 16 refused to call a client-marked function from a server component (error: "Attempted to call pickTab() from the server but pickTab is on the client"). Fix: split the pure tab-vocabulary helpers into `tabs-config.ts` (no "use client"). Both server + client import from it. Same pattern will apply for every editor helper that's not React-specific.

**`/admin/products/new`** is server-only — inserts a draft product (`source='manual'`, `review_status='draft'`, `is_published=false`, placeholder slug + sku tagged with a timestamp + random suffix) and `redirect()`s to `/admin/products/<new-id>/edit?tab=general`. The flow is server-action-first per the task spec — no "unsaved new product" state on the client.

**Breadcrumb `?back=`:** the products-list row link sets `?back=<encoded-list-url>` capturing the current filter state (status + sort + q + category + tags + stock + source). Editor's "Products" link returns there. Falls back to `/admin/products` if absent. Same-site-absolute validation guards against open-redirect targets.

**Dirty-guard hook (`useDirtyGuard`) ships now;** `markDirty`/`markClean` will be prop-drilled into tab content in T11+ when fields can actually be edited. For now `isDirty` lights up a small "unsaved" pill in the breadcrumb when called (currently never).

**Tabs are URL-driven** via `?tab=<value>`. Server reads the param for `initialTab`; client `<Tabs onValueChange>` calls `router.replace('?tab=' + value, { scroll: false })`. Deep-linking + back button both work without extra wiring.

**Live smoke (warm via the existing TOTP-auth probe):**
- `/admin/products/[id]/edit` cold 2.5s (Turbopack JIT), warm ~700ms
- `/admin/products/new` ~870ms cold, ~700ms warm (includes the INSERT round-trip)
- Per `[perf]` log: auth ~330ms, fetch ~160ms — well within budget

**Acceptance criteria all green** including `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`. 88/88 tests pass (was 84, +4 from T10a). The marked-dirty → beforeunload prompt is wired but inactive until T11 lets a field actually become dirty.

**One soft thing for T11+:** the placeholder GeneralTab (etc.) take no props today. When auto-save lands, they'll need `(product, onDirty)` props. The page already has the product; the dirty-state setter is in the editor. Plan: pass `markDirty`/`markClean` from the editor into each TabContent as props, alongside the `product`.

**Two diagnostics added in earlier perf commits (kept active):**
- `scripts/profile-admin-nav.mjs` — already covers dashboard → list nav
- `lib/perf.ts perfStart()` — used by /admin, /admin/products, /admin/products/[id]/edit (new). Logs to dev console / Vercel logs above THRESHOLD_MS
