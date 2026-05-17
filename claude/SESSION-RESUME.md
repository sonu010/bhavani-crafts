# Session resume — 2026-05-16

> Compressed digest for picking up the rebuild in a fresh chat session. Read this first, then `plans.md`, then `progress.md`. Everything below is current as of commit `db75720` on `rebuild-v2`.

---

## 30-second state

- **Phase 0 ✅ · Phase 1 ✅ · Phase 1.5 CI ✅ · Phase 2 design decisions ✅**, no Phase 2 code yet
- **Live preview:** https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/ (placeholder + `/api/health` green + `/design` 404 in prod)
- **Production:** https://bhavani-crafts.vercel.app/ — legacy prototype, untouched
- **CI:** both jobs green (`static` + `live`); secrets configured; runs on every push to `rebuild-v2`
- **Live Supabase schema:** 11 enums · 20 tables · 45 indexes · 37 functions (after 0008 search indexes + 0009 status-count RPC)
- **Catalog:** seeded from `data/justkraft-inventory/justkraft_products.cleaned.json` (~5.8K products). For exact live counts run `node web/scripts/count-live-products.mjs`; for the most-recent reseed totals see `data/justkraft-inventory/seed_report.json`. All rows are `is_published=false`, RLS-blocked from anon.

```
rebuild-v2 head:  db75720  fix(ci): bump runner Node 20 → 22
                  b8083e1  data: split seed pipeline into clean → seed; doc the gap
                  2c77871  docs: Phase 0/1/1.5 cold-start hygiene pass
                  445d21e  chore: clear lint warnings + fix broken test assertion
                  f1b58e0  P1.5: GitHub Actions CI
```

## Read first (in order)

1. `claude/SESSION-RESUME.md` ← you are here
2. `claude/architecture/engineering-principles.md` — non-negotiable rules (read every session)
3. `claude/plans.md` — every task with status (Phase 0/1/1.5 ✅, Phase 2 stubs only)
4. `claude/progress.md` — counts + commit history + what runs locally + non-blocking follow-ups
5. `claude/architecture/testing-and-ci.md` — DI Supabase client + pglite + CI workflow
6. `claude/blockers.md` — owner-pending items
7. The task file you're about to pick up

`web/AGENTS.md` reminds you Next.js 16 has breaking changes from older versions — don't trust training-data memory for Next/React/Tailwind v4/Supabase JS v2.

## What's locked (don't re-decide unless explicitly asked)

### Engineering principles (owner's standard)

`claude/architecture/engineering-principles.md`. Summary:
- Simple over abstract, smallest effective change
- Fail fast — no silent fallbacks, no defensive layers
- One correct path (delete the old when replacing)
- No automatic agreement; push back when assumptions look weak
- Strong typing, compile-time guarantees over runtime guards
- No motivational language; no emoji decoration in chat

### Stack
- Next.js 16.2.6 (App Router, Turbopack default) + React 19.2.4 + Tailwind v4 + shadcn/ui (radix-maia style)
- Supabase (Postgres + Auth + Storage + Edge Functions)
- pnpm 10 + Node 22 (CI) / Node 25 (local owner)
- Zustand cart (port from `origin/main` at P3-T21)
- Anthropic Claude (Phase 4) — Haiku default, Sonnet for drafts
- See ADRs 001–010 in `claude/decisions/`

### Design system (also locked for admin)
`claude/architecture/design-system.md`. Cream bg · bark text · teal primary CTAs · clay brand accents (NOT buttons) · saffron highlight only · moss/brick semantic · Newsreader (display) + Manrope (body) + JetBrains Mono (numerics only). 4px spacing base. 6/12/24 radius. Single warm shadow. 180ms ease-out. WCAG AA verified.

### Data layer pattern
**Dependency-injected Supabase client.** Every function in `web/src/lib/db/*.ts` takes `SupabaseClient<Database>` as its first arg. No magic global. Same function works in server components, server actions, scripts, and tests. See ADR-010 + `architecture/testing-and-ci.md`.

### Verification stack (you run these before any push)
```bash
cd web
pnpm tsc --noEmit            # ~3s — strict typecheck of src/
pnpm lint                    # ~3s
pnpm validate:migrations     # ~6s — all migrations through pglite
pnpm exec vitest run __tests__/db/   # ~10s — 21 integration tests vs live
pnpm launch-blockers         # ~12s — 12 deploy-gate checks vs live
pnpm build                   # ~30s — full Vercel-equivalent build
```

### Git workflow
- Targeted `git add <paths>` ONLY — never `-A`. (User-provided unrelated files got swept in once; rule made permanent.)
- Branch is `rebuild-v2`; `main` is untouched legacy
- AI runs `supabase db push` itself (CLI logged in locally)
- Owner has not asked AI to push to `main` yet — wait for explicit go-live signal

## Phase 2 design decisions — JUST locked this session

These are NOT YET in any task file. Bake them into P2-T00 when expanding the Phase 2 stubs.

### Admin login

**URL: `/login`.** Industry-standard guessable URL (Vercel/Linear/Notion/GitHub/Stripe all use `/login`). Security via **defense in depth**, not URL obscurity. 10 layers:

1. Supabase Auth email + password (auth schema)
2. Generic error messages (no user enumeration)
3. Rate limiting (Supabase platform default + Upstash counter on the route)
4. hCaptcha integrated with `signInWithPassword({ options: { captchaToken } })`
5. TOTP 2FA mandatory for `owner` role (`aal2` enforced)
6. `HttpOnly` + `Secure` + `SameSite=Lax` session cookies (via `@supabase/ssr`, already wired)
7. CSP `frame-ancestors 'none'` (clickjacking; already in place)
8. `X-Robots-Tag: noindex, nofollow` on `/login`
9. Storefront has ZERO links to `/login` (not navigatable via crawl)
10. Audit log every attempt (success + failure) → Sentry anomaly alerts when wired

Supabase handles auth + sessions + rate limit + captcha + MFA natively. We build authz on top via `profiles.role` + RLS (already in place from 0001 + 0006).

### Admin products-list default filter

`/admin/products` defaults to **`?status=needs_review&sort=newest`** for the first month — the 5,804 seeded products are the owner's import queue. Header shows a chip count: "5,804 needs review · 0 ready · 0 published" with one-tap filter switching.

Hard-coded constant. When `needs_review` count drops below 50, flip default to `?status=published&sort=updated_at_desc` (steady state). One change, one place, when reality demands it.

### Admin mobile shape (360px)
**Sheet drawer.** Hamburger top-left → slides in from left, full nav reachable in one tap. shadcn `Sheet` primitive. Body width preserved. Matches Gmail/Linear convention.

### Admin dashboard at `/admin`
**2×3 grid of six widgets** (all visible above the fold on desktop):

```
┌─Catalog─────────┐  ┌─Searches with 0 results─────┐
│ N total         │  │ "stencil 4x4"      12×       │
│ N published     │  │ "wax seal kit"      7×       │
│ N out of stock  │  │ "monsoon resin"     4×       │
│ N uncategorized │  └──────────────────────────────┘
└─────────────────┘
┌─Mutations this week─────────┐  ┌─AI spend MTD────┐
│ product.update     87        │  │ $3.42 / $20.00  │
│ product.create      5        │  │ ███             │
│ category.update     2        │  │  17%   ✓ ok     │
└──────────────────────────────┘  └─────────────────┘
┌─Broken images─────┐  ┌─Background jobs──────────┐
│ 0 disputed        │  │ csv_import  ●●●●●○  82%  │
└───────────────────┘  └──────────────────────────┘
```

Diagnostic, not BI. **No revenue / customer / conversion widgets** — we have no checkout, no accounts, no orders in MVP. Building those analytics now would be pretending we have data we don't.

### "Frequent customers" — explicitly rejected for MVP

No customer accounts → nothing to compute "frequent" against. Owner already knows their repeat buyers in real life (Hyderabad craft shop). Revisit when checkout + accounts land in Phase 5+. The closest honest MVP feature is a future **WhatsApp bulk-enquiry recipients** table (Phase 4 candidate).

### Admin navigation tree (P2-T05)

```
Bhavani Crafts · admin
├── Dashboard               /admin
├── Products                /admin/products
│   ├── (list with filters/bulk actions)
│   └── /admin/products/:id/edit
├── Categories              /admin/categories  (tree view)
├── Tags                    /admin/tags
├── Attributes              /admin/attributes
├── Imports                 /admin/imports
├── Audit                   /admin/activity
├── Jobs                    /admin/jobs
├── Trash                   /admin/trash
└── Settings                /admin/settings
```

Top bar: brand wordmark + user menu (sign out, switch role if multi-role in future).

## Pending owner actions (non-blocking)

1. **Reseed live with the cleaned fixture.** Live has 7,780 pre-cleaner products; cleaned fixture has 5,804. All rows are `is_published=false` + RLS-blocked, so the gap doesn't affect anything user-facing. One command from `web/`:
   ```bash
   node scripts/seed-from-justkraft.mjs
   ```
   Wipe-and-reseed via the cleanup pass + cleaned input. Run before P3 storefront work.

2. **Real-content gate** (`user/05-content-the-AI-needs-from-you.md`) — owner provides 20 real products + 8 category photos + address/hours/WhatsApp + logo decision. Hard gate before Phase 4 polish; not yet needed.

3. **`/design` RSC payload leak** (logged in `blockers.md`) — `/design` returns HTTP 404 but the RSC payload still serializes the gallery content. Non-sensitive. Fixed via middleware in P2-T04 (same middleware that gates `/admin`).

## What "go" means right now

**`go` → I do P2-T00.** That's: expand the Phase 2 task stubs (P2-T01 through P2-T29 — currently frontmatter-only) into fully detailed task files with the just-locked decisions baked in:

- Login at `/login` with the 10-layer defense
- Default products filter `?status=needs_review`
- Sheet drawer mobile
- 2×3 dashboard grid
- DI Supabase client pattern (every function takes `supabase` as first arg)
- pglite-validate-before-push for any migrations
- Targeted `git add` only

After P2-T00 lands, **P2-T01** (Supabase Auth + `/login`) is the first buildable task.

## Files most worth scanning to refresh context

| File | Why |
|---|---|
| `claude/architecture/engineering-principles.md` | The rules. Audit log at the bottom records what was learned the hard way. |
| `claude/architecture/database-schema.md` | Spec + verified-from-live appendix at the bottom. |
| `claude/architecture/testing-and-ci.md` | DI client, pglite, vitest, launch-blockers, CI workflow shape. |
| `claude/architecture/security.md` | RLS policies, secret isolation, rate limits, CSP. |
| `claude/decisions/ADR-010-pglite-and-di-supabase.md` | Locks in the two patterns the data layer + CI rest on. |
| `claude/runbooks/seed-from-justkraft.md` | The clean → seed pipeline. |
| `web/scripts/launch-blockers.ts` | The 12-check deploy gate. |
| `web/src/lib/db/products.ts` | Example of the DI pattern in action. |

## Gotchas worth remembering

- **Migrations must be validated against pglite before `supabase db push`.** Two failed live pushes in P1-T01 set this bar (function-ordering bug + smoke-data slug regex). After validator landed: 0 further failed pushes across 6 migrations.
- **`@supabase/realtime-js` needs Node 22+** for native WebSocket. Local Node 25 hid it; CI on Node 20 caught it. Workflow is on Node 22 now.
- **Vercel build runs `tsc --noEmit` over the tsconfig include.** Scripts + tests excluded from Next's typecheck via `tsconfig.json` to keep CLI tools from gating builds.
- **Postgres RLS UPDATE/DELETE silently no-op when no policy matches** — they do not raise. Tests must assert "row unchanged" not "operation errored." See P1-T06 notes.
- **Multi-word synonyms break Postgres `tsquery`** unless parenthesized as AND groups. `buildTsquery` in `lib/db/search.ts` handles this.
- **Trigram threshold (0.3 default) misses typos against long product names.** Documented as a known issue in `architecture/search.md` §"Trigram threshold." Decision deferred to P3-T18; recommended fix is per-word tokenize + OR.
- **Hand-rolled Supabase Database types collapsed to `never`** under `@supabase/supabase-js` v2's structural constraints. We use `supabase gen types typescript --linked` now. Strip the leading `Initialising login role...` line and any trailing `<claude-code-hint .../>` from the generated output.
- **`product_images` has no UNIQUE on `(product_id, url)`** — the seed script does a cleanup pass at the start (DELETE all `source='justkraft_seed'` products → CASCADE) for idempotency.
- **CSV/JSON outputs in `data/justkraft-inventory/` are gitignored.** Raw scrape (21 MB) too. Obtain out-of-band; cleaner regenerates the rest.
- **`web/.env.local` is the source of truth for local dev secrets.** `web/.env.example` is the committed template. GitHub Actions secrets mirror the three Supabase keys.

## Conventions specific to this codebase

- All test/temp DB rows use slug prefix `zzz-` so they sort last and are trivially queryable for residue.
- Slugs must match `^[a-z0-9][a-z0-9-]{0,79}$` (CHECK constraint).
- Every migration ends with a `DO $$ ... $$` smoke block that asserts its own constraints.
- Every server action that mutates the catalog calls `revalidateTag()` / `revalidatePath()` per the mutation map in `architecture/caching-and-revalidation.md`.
- All AI generations land in `ai_generations` with `status='proposed'` first. No auto-apply.
- Soft delete is the default; hard delete needs typed confirmation.
- Service-role client (`lib/db/admin.ts`) is ESLint-restricted to `app/admin/**`, `app/api/admin/**`, `scripts/**`.

---

If anything in this file disagrees with `plans.md` or `progress.md`, those are the truth — update this file. If they all agree, you've got the full picture.
