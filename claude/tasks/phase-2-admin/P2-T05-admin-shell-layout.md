---
id: P2-T05
phase: 2
title: Admin shell layout (sidebar + top bar)
status: done
depends_on: [P2-T04]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin` and every `/admin/<sub>` route renders inside a shared layout: a persistent left sidebar with the locked navigation tree (Dashboard, Products, Categories, Tags, Attributes, Imports, Audit, Jobs, Trash, Settings), a top bar with the brand wordmark + a user menu (sign out, current role). Mobile (<768px) collapses the sidebar into a shadcn `Sheet` drawer triggered by a hamburger at top-left. Active route highlighted; all interaction styled with the locked design tokens.

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin navigation tree (P2-T05)" — the verbatim nav tree
- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin mobile shape (360px)" — Sheet drawer locked
- [claude/architecture/design-system.md](../../architecture/design-system.md) — color tokens, typography, spacing
- [`web/src/components/ui/sheet.tsx`](../../../web/src/components/ui/sheet.tsx) — shadcn primitive already installed
- [P2-T04](P2-T04-middleware-admin-gate.md) — `requireRole(supabase, 'admin')` is the first call in the layout's server component

# Files to touch

- `web/src/app/admin/layout.tsx` (new) — server component. Calls `requireRole(supabase, 'admin')`. Wraps children in `<AdminShell>`. Sets `export const dynamic = 'force-dynamic'` (admin is never cached).
- `web/src/app/admin/admin-shell.tsx` (new) — client component. Renders sidebar + top bar + main content slot. Reads current pathname via `usePathname()` for active-link highlight.
- `web/src/app/admin/nav-tree.ts` (new) — single source of truth for the nav array: `{ label, href, icon }[]`. Imported by both desktop sidebar and mobile drawer.
- `web/src/app/admin/user-menu.tsx` (new) — client component using shadcn `DropdownMenu`. Shows current role badge + sign-out item. Calls a server action `signOutAction()`.
- `web/src/app/admin/actions.ts` (new) — `signOutAction()` server action: `supabase.auth.signOut({ scope: 'global' })` + audit log + `redirect('/login')`.
- `web/src/app/admin/page.tsx` (new) — dashboard placeholder for this task; actual widgets land in P2-T06.
- `web/src/app/admin/forbidden/page.tsx` (new) — rendered when `requireRole` throws `ForbiddenError`; minimal "You don't have permission" + sign-out link.

# Implementation notes

**Nav tree — locked (verbatim from SESSION-RESUME):**

```ts
export const ADMIN_NAV: Array<{ label: string; href: string; icon: LucideIcon }> = [
  { label: "Dashboard",  href: "/admin",            icon: LayoutDashboard },
  { label: "Products",   href: "/admin/products",   icon: Package },
  { label: "Categories", href: "/admin/categories", icon: FolderTree },
  { label: "Tags",       href: "/admin/tags",       icon: Tag },
  { label: "Attributes", href: "/admin/attributes", icon: Sliders },
  { label: "Imports",    href: "/admin/imports",    icon: Upload },
  { label: "Audit",      href: "/admin/activity",   icon: ScrollText },
  { label: "Jobs",       href: "/admin/jobs",       icon: Activity },
  { label: "Trash",      href: "/admin/trash",      icon: Trash2 },
  { label: "Settings",   href: "/admin/settings",   icon: Settings },
];
```

Note: "Audit" navigates to `/admin/activity` (not `/admin/audit`), matching the URL chosen in P2-T26.

**Design tokens — only these, no off-palette values.** Sidebar bg `cream-50`. Active link bg `husk-100`, left-border 3px `teal-800`, text `bark-900`. Inactive link text `stone-500`, hover bg `husk-100`. Top bar bg `paper-0` with 1px `husk-200` bottom border. Brand wordmark `clay-600` Newsreader italic. Body text Manrope. No JetBrains Mono in chrome (it's reserved for numerics per [design-system.md](../../architecture/design-system.md)).

**Mobile drawer — shadcn `Sheet` primitive.** Hamburger button (shadcn `Button` variant=ghost, icon-only) at top-left in the top bar. Sheet slides in from `side="left"`. Width 280px. Same nav array, same active-link styling. Body width preserved when sheet opens (no scroll lock — admin tables are wide and scroll-lock makes them feel broken on iPad). Sheet closes on link click via `<Link onClick={() => setOpen(false)}>`.

**Active link logic.** `pathname.startsWith(item.href)` with an exception for `/admin` itself (which is a prefix of everything; use exact match for that one).

**Sign-out flow.**

```ts
"use server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { recordAuthAttempt } from "@/lib/auth/audit";

export async function signOutAction() {
  const supabase = await createServerClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.auth.signOut({ scope: "global" });
  if (user) {
    await recordAuthAttempt(admin, {
      actor_id: user.id, action: "auth.signout",
      entity_type: "session", entity_id: null,
      before_json: null, after_json: null, request_id: null,
    });
  }
  redirect("/login");
}
```

**Layout caching — none.** `export const dynamic = 'force-dynamic'`. Per [caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"What we deliberately don't cache": admin pages never cache; owner sees writes immediately.

**Performance budget.** Layout server component does exactly two DB calls: `auth.getUser()` (via createServerClient) and the role lookup inside `requireRole`. Don't add a third (e.g. "fetch unread audit-log count"); badge counters live inside their own widgets in P2-T06.

# Acceptance criteria

- [ ] `/admin` (signed in as admin/owner) renders sidebar + top bar + dashboard placeholder.
- [ ] Sidebar shows all 10 nav items in the order listed above.
- [ ] Active link highlighted (`husk-100` bg, 3px `teal-800` left border).
- [ ] User menu shows role badge + sign-out item. Sign-out redirects to `/login` and writes an `audit_logs` row with `action='auth.signout'`.
- [ ] At viewport width 360px, sidebar is hidden; hamburger opens a `Sheet` from the left with the same nav.
- [ ] At viewport width ≥ 768px, hamburger is hidden; sidebar visible.
- [ ] Anonymous request to `/admin` → middleware redirect to `/login` (verified by P2-T04 tests; no regression here).
- [ ] Authenticated viewer GET `/admin` → renders `/admin/forbidden` (because `requireRole(supabase, 'admin')` throws).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm build

pnpm dev &
sleep 4
# Sign in as admin (via /login + P2-T01 flow). Then:
# 1. Visit /admin → shell renders, sidebar visible, all 10 links present
# 2. Resize devtools to 360px → sidebar hides, hamburger appears, Sheet opens on click
# 3. Click "Products" in the sheet → navigates + sheet closes
# 4. Open user menu → sign out → redirected to /login
# 5. SELECT * FROM audit_logs WHERE action = 'auth.signout' → one row
```

# Dependencies added

None — `lucide-react`, `shadcn/sheet`, `shadcn/dropdown-menu` already installed.

# Notes for next agent

**2026-05-17 — DONE.** Single commit on `rebuild-v2`.

**Route-group layout structure:**

```
app/admin/
├── 2fa-setup/          ← outside (shell): reached by AAL1 sessions
├── forbidden/          ← outside (shell): reached when requireRole throws
└── (shell)/            ← gated workspace, requires admin + AAL2
    ├── layout.tsx      ← requireRole('admin') + requireAAL2 + AdminShell
    ├── admin-shell.tsx ← sidebar + topbar + Sheet mobile drawer
    ├── nav-tree.ts     ← 10 nav items per SESSION-RESUME
    ├── user-menu.tsx   ← DropdownMenu with sign-out
    ├── actions.ts      ← signOutAction
    └── page.tsx        ← dashboard placeholder (P2-T06 fills the widgets)
```

The `(shell)` route group is invisible in URLs — `/admin/products` still resolves correctly when P2-T07 lands its directory inside `(shell)/`. The pattern keeps the gating layout from looping `/admin/forbidden` and `/admin/2fa-setup` through itself.

**Base UI, not Radix.** The shadcn components in this codebase wrap `@base-ui/react` (the Base UI library, not Radix Primitives). Base UI uses a `render` prop instead of Radix's `asChild`. Pattern:

```tsx
<SheetTrigger render={<Button variant="ghost">…</Button>} />
<DropdownMenuTrigger render={<Button variant="ghost">…</Button>} />
```

This was a real-world Next-16-meets-Base-UI gotcha — the expanded task wrote the example with `asChild` (Radix convention), tsc rejected it, I had to switch. Documenting so the next agent reaching for these primitives knows the deal.

**Three-layer auth verified end-to-end:**
1. Proxy gates `/admin/*` at the edge (anon → /login, AAL1 → /admin/2fa-setup or /auth/verify-2fa).
2. `(shell)/layout.tsx` calls `requireAAL2` and `requireRole('admin')`. Catches `AuthError` and redirects per the error's `redirectTo`, or to `/admin/forbidden` for raw `ForbiddenError`.
3. RLS still backs up writes at the DB.

**Sign-out flow:** server action calls `supabase.auth.signOut({ scope: 'global' })`, writes `auth.signout` audit row, redirects to `/login`. Pattern matches the rest of T01's audit usage.

**Sheet drawer at 360px (mobile):** hamburger top-left, drawer slides from `side="left"`, full nav reachable in one tap. Body width preserved (no scroll lock). Closes on link tap via local `useState`.

**Active-link detection:** `isActiveNav(itemHref, pathname)` exact-matches `/admin` (since it's a prefix of everything) and uses `startsWith(`${href}/`) || ===` for the rest. Border + bg styling per design-system.md.

**Smoke verified:**
- `curl -sI /admin` (anon) → 307 (proxy bounces to /login)
- `curl -sI /admin/products` (anon) → 307
- Build registers `/admin` as a dynamic route under the (shell) group; URL is `/admin`, not `/admin/(shell)`

**Outstanding for downstream tasks:**
- P2-T06 fills in the dashboard widgets; replaces the placeholder in `(shell)/page.tsx`.
- P2-T07 onwards creates routes inside `(shell)/products/`, `(shell)/categories/` etc.
- The nav-tree `Settings` entry (`/admin/settings`) has no destination yet — wire when settings page lands (no current task; flag as a P2-T29-or-later cleanup).
