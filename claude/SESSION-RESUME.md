# Session resume — 2026-05-28

> Compressed digest for picking up the rebuild in a fresh chat session. Read this first, then `plans.md`, then `progress.md`. Current as of commit `7d34e82` on `rebuild-v2`.

---

## 30-second state

- **Phase 0 ✅ · Phase 1 ✅ · Phase 1.5 CI ✅ · Phase 2 ✅ (built) · Phase 3 planned + started**
- **Phase 2 admin panel is fully built** — 28/30 tasks done; the two open tasks are owner-blocked (creds), not unfinished engineering:
  - **P2-T01** (auth + `/login`) — `in_progress`. Login + TOTP 2FA + middleware gate now **verified end-to-end by Playwright** (a real 2FA-login bug was found + fixed 2026-05-28 — see Phase 2 §Admin login). Remaining = hCaptcha keys + Upstash rate-limit creds (owner must supply).
  - **P2-T03** (promote-owner runbook) — `in_progress`. The browser-smoke it was blocked on is now covered by the E2E login flow; owner should still confirm once on the REAL prod account.
- **Test environment (NEW 2026-05-28):** all fixture-creating tests run against a disposable LOCAL Supabase stack — never prod. **239 vitest + 12 launch-blockers + 6 Playwright E2E all green on local.** Guardrails refuse non-local URLs. Backup/rollback tooling + nightly read-only backup CI added. See "Test environment + prod-data safety" below.
- **Phase 3 storefront** — `T00` planning + `T01` layout + **`T02–T09` landing** + **`T10–T12` category** + **`T13–T16` PDP** + **`T17` JSON-LD** + **`T18–T19` search** + **`T20–T21` cart** + **`T24` SEO** (sitemap.xml + robots.txt + canonical/OG/Twitter on PDP/category, root `title.template` wraps every page suffix-free). Shared helpers: `lib/db/storefront.ts`, `lib/db/pdp.ts`, `lib/storefront/{site-url,cart-store,safe-read}.ts`. **P3-T29 E2E GREEN locally — 41 specs** (5 new SEO specs covering robots/sitemap/canonical/og/title-template). **Remaining: T22 (mobile pass), T23 (Lighthouse), T25–T28 (payments).** Migrations through 0014.
- **Live Supabase schema:** migrations through `0013`. ~11 enums · 20 tables · ~49 indexes · ~40 functions. Run `node web/scripts/dump-live-schema.mjs` for exact counts + appendix refresh.
- **Catalog:** seeded from `data/justkraft-inventory/justkraft_products.cleaned.json` (~5.8K products), all `is_published=false` + `review_status=needs_review`, RLS-blocked from anon. Scraped dupes triaged (see Gotchas).
- **Live preview:** https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/ · **Production:** https://bhavani-crafts.vercel.app/ (legacy prototype, untouched). **CI:** `static` + `integration` + `e2e` (all local, no prod writes) on every push to `rebuild-v2`.

```
rebuild-v2 head:  7d34e82  P3-T29 (partial) — Playwright E2E harness + admin critical-flow specs
                  f05d810  P3-T01 — public storefront layout + nav + shared ProductCard
                  6fb1dca  docs: add architecture/performance.md (cross-phase reference)
                  d138f75  docs(p3): bake the storefront performance contract into task specs
                  771f44f  perf(admin): proxy verifies JWT locally (getClaims) not getUser
                  3cf902e  P3-T00 — expand Phase 3 storefront task files + add missing tasks
                  f4e8b85  P2-T23/T24/T25 — CSV import: upload + validate + apply + report
```

## Read first (in order)

1. `claude/SESSION-RESUME.md` ← you are here
2. `claude/architecture/engineering-principles.md` — non-negotiable rules (read every session)
3. `claude/architecture/performance.md` — the two-system perf model + budgets (Phase 3 work must honor it)
4. `claude/plans.md` — every task with status (Phase 0/1/1.5/2 ✅; Phase 3 stubs, T01 done)
5. `claude/progress.md` — counts + commit history + what runs locally
6. `claude/blockers.md` — owner-pending items
7. The task file you're about to pick up

`web/AGENTS.md` reminds you Next.js 16 has breaking changes from older versions — don't trust training-data memory for Next/React/Tailwind v4/Supabase JS v2. **Read `node_modules/next/dist/docs/` before writing Next code.**

## What's locked (don't re-decide unless explicitly asked)

### Engineering principles (owner's standard)

`claude/architecture/engineering-principles.md`. Summary: simple over abstract; smallest effective change; fail fast (no silent fallbacks / defensive layers); one correct path (delete the old when replacing); no automatic agreement (push back on weak assumptions); strong typing over runtime guards; no motivational language; no emoji decoration.

### Stack
- Next.js 16.2.6 (App Router, Turbopack default) + React 19.2.4 (React Compiler on) + Tailwind v4 + shadcn/ui on **@base-ui/react** (NOT Radix — no `asChild`, uses `render`)
- Supabase (Postgres + Auth + Storage + Edge Functions); `@supabase/ssr` + `@supabase/supabase-js` v2
- pnpm 10 + Node 22 (CI) / Node 25 (local owner)
- Zustand cart (port from `origin/main` at P3-T21)
- **Razorpay** for payments (Phase 3 — see scope change below)
- Anthropic Claude (Phase 4) — Haiku default, Sonnet for drafts
- See ADRs 001–010 in `claude/decisions/`

### Design system (locked for storefront + admin)
`claude/architecture/design-system.md`. Cream bg · bark text · teal primary CTAs · clay brand accents (NOT buttons) · saffron highlight only · moss/brick semantic · Newsreader (display) + Manrope (body) + JetBrains Mono (numerics only). 4px spacing base. 6/12/24 radius. Single warm shadow. 180ms ease-out. WCAG AA.

### Data layer pattern
**Dependency-injected Supabase client.** Every function in `web/src/lib/db/*.ts` takes `SupabaseClient<Database>` as its first arg. Same function works in server components, server actions, scripts, and tests. ADR-010 + `architecture/testing-and-ci.md`. **Service-role isolation:** only `lib/db/admin.ts` imports `SUPABASE_SERVICE_ROLE_KEY`; ESLint `no-restricted-imports` enforces.

### Verification stack (run before any push)
```bash
cd web
pnpm tsc --noEmit            # strict typecheck of src/
pnpm lint
pnpm validate:migrations     # all migrations through pglite
pnpm test:setup              # ONE-TIME/session: boot local Supabase + migrate + seed + write env
pnpm test                    # vitest data-layer + unit suites vs LOCAL stack (239 tests)
pnpm launch-blockers         # 12 deploy-gate checks (point at local: `set -a; . ./e2e/.env.e2e; set +a`)
pnpm build                   # full Vercel-equivalent build
pnpm test:e2e                # Playwright login+2FA+admin flows vs LOCAL prod build (6 tests)
```

### Test environment + prod-data safety (NEW — 2026-05-28)

**All fixture-creating tests run against a disposable LOCAL Supabase
stack, NEVER production.** This closed a real exposure: vitest + CI used to
INSERT/DELETE against the live project. Now:
- `pnpm test:setup` = `supabase start && supabase db reset && node scripts/write-test-env.mjs`. Writes `web/.env.test` (vitest) + `web/e2e/.env.e2e` (Playwright) from the running local stack. Re-run after schema changes via `pnpm db:reset:test`.
- **Guardrail:** `vitest.setup.ts` + `__tests__/db/_clients.ts` HARD-REFUSE any non-local Supabase URL unless `ALLOW_NONLOCAL_TEST_DB=1`. A typo can't hit prod.
- `supabase/seed.sql` (local-only, not pushed) seeds a deterministic catalog (4 cats, 5 published + 3 needs_review products, owned-license images, tags) so storefront/admin/launch-blocker tests have data.
- `config.toml [auth.mfa.totp]` enabled locally (mirrors prod) so MFA tests + the E2E TOTP admin seed work.
- **Backups/rollback:** `pnpm backup:live` (read-only paginated JSON snapshot → `web/backups/`, gitignored) before any risky op; `pnpm restore:live <dir>` (dry-run default; `--confirm=<host>` to execute) rolls changed/deleted rows back. Nightly read-only `backup.yml` CI workflow uploads a 90-day artifact. Runbook: `claude/runbooks/backup-and-restore.md`.
- **CI** (`.github/workflows/ci.yml`): `static` + `integration` (vitest + launch-blockers on local Supabase) + `e2e` (Playwright on local). The old destructive `live` job (vitest vs prod) is REMOVED. Prod is touched only by the read-only nightly backup.

### Git workflow
- **Targeted `git add <paths>` ONLY — never `-A`.** (Unrelated files got swept in once; rule is permanent.)
- Branch is `rebuild-v2`; `main` is untouched legacy.
- AI runs `supabase db push` itself (CLI logged in locally), but only after `pnpm validate:migrations` is green.
- **Owner has not asked AI to push to `main` / go live — wait for explicit signal.** Never commit unless explicitly asked; never skip hooks; never commit secrets (`.env*`).

## Phase 2 — built (reference, not to re-decide)

The decisions below are **already implemented** in `web/src/app/(shell)/admin/**` + `web/src/lib/db/admin/*`. Listed so a new session knows the shape without re-reading every task file.

- **Admin login `/login`** — Supabase email+password + generic errors + TOTP 2FA mandatory for `owner` (`aal2`), HttpOnly/Secure/SameSite=Lax cookies, CSP `frame-ancestors 'none'`, `X-Robots-Tag: noindex`, zero storefront links, audit-log every attempt. **Owner-blocked add-ons:** hCaptcha (`signInWithPassword({ options:{ captchaToken } })`) + Upstash rate-limit counter — wired but disabled pending keys.
  - **2FA login bug FOUND + FIXED by the E2E (2026-05-28):** the login action redirected to `/admin`, the proxy soft-bounced to `/auth/verify-2fa`, but Next rendered the 2FA form at the wrong URL (`/admin`) with a dead form action — so submitting the code did nothing and **no owner could finish logging in**. Fix: `login/actions.ts` now redirects AAL1 sessions DIRECTLY to `/auth/verify-2fa?next=…` (or `/admin/2fa-setup`); `next` is propagated through `verify-2fa` page/form/action. This is what P2-T03's owner browser-smoke would have caught — now covered by `e2e/auth.setup.ts`.
- **Three-layer authz** — `proxy.ts` middleware → `requireRole`/`requireAAL2` in `lib/auth/require.ts` → RLS. Middleware also 404s `/design*` in prod (closed the RSC-payload leak from `blockers.md`).
- **Admin shell** (`(shell)/admin/layout.tsx`) — nav tree: Dashboard · Products · Categories · Tags · Attributes · Imports · Audit (`/admin/activity`) · Jobs · Trash · Settings. Top bar = wordmark + user menu. Mobile = shadcn `Sheet` drawer (hamburger top-left).
- **Dashboard** (`/admin`) — 2×3 diagnostic widget grid (Catalog counts · zero-result searches · mutations this week · AI spend MTD · broken images · background jobs). **No revenue/customer/conversion widgets** (no checkout/accounts/orders in MVP — building that BI now is pretending we have data we don't).
- **Products list** — default filter `?status=needs_review&sort=newest` (hard-coded; flip to `published` when needs_review < 50). Cursor-paginated, filters (status/category/tags/stock/source) + FTS, bulk actions (soft-delete/publish/recategorize).
- **Product editor** — tabs General/Category/Attributes/Variants/Images/Publish. Images: `file-type` MIME sniff (not Content-Type), webp/jpeg/png/heic/heif, 5 MB + 4000² caps, EXIF strip via sharp, `license_status=unverified` default. dnd-kit reorder. Publish-state trigger enforced in 0004; preview via `?preview=token`.
- **Categories/Tags/Attributes** admins · **CSV import** (upload→validate→preview, then jobified execute via `background_jobs`, then read-only report over `import_runs`/`import_run_rows`) · **Audit/Jobs viewers** (read-only) · **Trash** (ADR-006: soft-delete default, 30-day retention, typed-confirmation hard delete).
- **Soft delete is the default everywhere; bulk delete is always soft.** Every admin mutation writes before/after JSON to `audit_logs` via service-role and calls `revalidateTag`/`updateTag` per `architecture/caching-and-revalidation.md`.

## Phase 3 — planned + just-locked decisions (don't re-decide)

### Scope change — payments via Razorpay (overrides `overview.md`)
MVP now includes **checkout + payments through Razorpay**, added during P3-T00 planning. This supersedes any "no checkout in MVP" wording in `overview.md`. The payments cluster is **T25–T28** and has a hard dependency gate:

- **P3-T25** — orders schema migration + payments ADR. **Prerequisite for T26–T28.** Build this first.
- **P3-T26** — server-side Razorpay order create.
- **P3-T27** — checkout page.
- **P3-T28** — payment verification (HMAC signature verify, server-side) + confirmation + webhook.
- **Security:** the Razorpay **secret key never ships to the client** — only the public `key_id` (`NEXT_PUBLIC_*`). Signature verification is server-side only. Owner must supply Razorpay **test keys** before T26.

### Homepage shape
Landing = **flag (curated) + category** composition (owner's pick). Hero (T02) → caption strip (T03) → Atlas categories (T04) → weekly collection (T05) → kits row (T06) → bulk-enquiry (T07) → visit section (T08) → footer (T09).

### Storefront performance contract (`architecture/performance.md`)
**Two-system model:** storefront is cacheable (ISR + tags), admin is auth-gated (can't cache). Honor these in every Phase 3 task:
- Storefront reads use `unstable_cache(fn, keyParts, { tags, revalidate })`. Cache-tag vocab: `products`, `categories`, `product:<slug>`, `homepage`, `featured`. P3-T01 proved `/` renders `○ Static, Revalidate 5m`.
- **A cookie-bound client CANNOT go inside `unstable_cache`** (reading `cookies()` forces dynamic). Cacheable public reads use `createPublicClient()` (cookie-less anon, `lib/db/public-client.ts`). Session-dependent reads use `createServerClient`.
- Budgets: cached TTFB < 200ms · LCP < 2.5s · admin nav p75 < 800ms.
- **Admin auth was the bottleneck, not queries.** Fixed in `proxy.ts`: replaced `getUser()` + `getAuthenticatorAssuranceLevel()` (two network round-trips, doubled) with `getClaims()` (local ES256 WebCrypto JWT verify, no network — reads `claims.sub` + `claims.aal`). The live project uses asymmetric ES256 keys (verified via `/auth/v1/.well-known/jwks.json`), which `getClaims` requires. `requireRole`/`requireAAL2` stay authoritative; middleware is just a fast pre-filter.

### E2E integration tests (`architecture/testing-and-ci.md` + `web/e2e/`)
Playwright harness built (P3-T29 `in_progress`). Drives the **real admin UI** against a **local Supabase stack** (NOT production).
- Projects: `setup` (real `/login` → `/auth/verify-2fa` TOTP via otplib) → `admin` (reuses storageState) + `anon` (guards).
- Specs exist: `anon/auth-guard.spec.ts`, `admin/products.spec.ts`. **Still to add:** bulk + trash specs, CI `e2e` job, first green run.
- `web/e2e/seed-admin.ts` creates the TOTP admin on the local stack and **refuses any non-127.0.0.1 URL** (safety).
- **RAN GREEN this session (2026-05-28):** bring up = `pnpm test:e2e:setup` (= `test:setup` + `e2e:seed`) + `pnpm exec playwright install chromium`, then `pnpm test:e2e`. 6/6 pass against a local prod build. See `web/e2e/README.md`.

## Pending owner actions

1. **Razorpay test keys** — gate before P3-T26.
2. **hCaptcha keys + Upstash creds** — finish P2-T01 hardening (login works without them; they add rate-limit + captcha layers).
3. **Confirm prod login on the REAL owner account** — the 2FA bug fix is verified locally by E2E; do one sign-in + 2FA on the live owner account to close P2-T03.
4. **Real-content gate** (`user/05-content-the-AI-needs-from-you.md`) — 20 real products + 8 category photos + address/hours/WhatsApp + logo. Hard gate before Phase 4 polish.

## What "go" means right now

**`go` → continue the Phase 3 storefront build.** Landing (T02–T09) + category (T10–T12) + PDP (T13–T16) + JSON-LD (T17) + search (T18–T19) + cart (T20–T21) + SEO (T24) DONE. Remaining order:
1. **Payments gate** — T25 (orders schema migration + payments ADR; gates Razorpay T26–T28). Owner must provide Razorpay test keys for T26+.
2. **Polish** — T22 (mobile pass at 360px audit of `/c`, `/p`, `/search`, cart drawer) → T23 (Lighthouse pass against `architecture/performance.md` budgets).
2. **Cart** — T20 (drawer) + T21 (Zustand store port from `origin/main`).
3. **Payments cluster** — **T25 first** (orders schema + ADR — gate), then T26 → T27 → T28. Needs Razorpay test keys.
4. **Polish** — T17 (JSON-LD) · T24 (sitemap/robots/metadata) · T22 (mobile pass) · T23 (lighthouse) · finish T29 (E2E: bulk/trash specs + CI job).

Every Phase 3 task must honor the performance contract (cacheable reads, `createPublicClient` for cached, budgets) and the cross-cutting patterns (DI client, soft delete, audit logs, revalidate tags, targeted `git add`).

## Gotchas worth remembering

**Admin filter-bar infinite loop (2026-05-29 — FIXED):**
- **A `useEffect` that calls `router.replace` and (transitively) depends on `searchParams` is an infinite loop.** `router.replace` → new `searchParams` reference → recreated `sync` callback → effect re-fires → replace again, ~3×/sec. Symptom: continuous `GET /admin/activity` in the dev log + the whole admin UI unable to navigate (router stuck in a perpetual pending transition). Hit `activity/filter-bar.tsx` AND `jobs/filter-bar.tsx`.
- **Fix pattern:** build the query string from local state only (NOT from `searchParams`), drop `searchParams` from the effect deps, and add a no-op guard (`if (current URL params === built qs) return;`, reading `window.location.search` at call time). The effect then runs once per real filter change. `products/filter-bar.tsx` was already correct (URL-driven, `pushFilters` only on user events — no auto-firing effect; copy that pattern).
- **ESLint `react-hooks/exhaustive-deps` does NOT catch this** — the deps were exhaustive; the bug was that an exhaustive dep (`searchParams`) is unstable-by-design and mutated by the effect itself. Regression guard: `e2e/admin/navigation.spec.ts` (navigate away from each filter page). Do NOT use `waitForLoadState("networkidle")` to detect it — keep-alive sockets make networkidle flaky; assert navigation instead.
- **Seed hardening:** `e2e/seed-admin.ts` now enrolls TOTP with a unique `friendlyName` — re-running `pnpm e2e:seed` without a `db reset` no longer fails with `mfa_factor_name_conflict` (a lingering unverified factor named `""` that `listFactors().all` doesn't return).

**SEO + Next 16 metadata template (2026-05-29):**
- **Setting `title` (even `{ absolute }`) in `(storefront)/layout.tsx` overrides the root `title.template` for every descendant.** Cost me a rebuild — PDP titles silently dropped the suffix. Fix: put the home tagline in `title.default` at ROOT (defaults are NOT templated; the template wraps every per-page string title via `%s — Bhavani Crafts`) and drop the storefront layout's title entirely.
- **`metadataBase` + relative `alternates.canonical` is the clean pattern.** Set `metadataBase: new URL(siteUrl())` once at root; per-page metadata uses `alternates: { canonical: "/p/<slug>" }` (string, not URL). Next resolves it to absolute. Same for `openGraph.url` and `openGraph.images`.
- **Sitemap routes are cached by Next's Data Cache.** A `sitemap.ts` with `export const revalidate = 3600` regenerates at most once per hour even under load — verified `/sitemap.xml` static-prerendered with `Revalidate 1h` in build output. Wrap the DB read in `readOrEmpty` so a transient outage degrades to a static-pages-only sitemap.
- **PostgREST 1000-row cap applies to sitemap paginated reads too.** `listAllPublishedSlugs` / `listAllCategorySlugs` loop in 1000-row chunks until short.
- **OpenGraph image is rejected by next/image at build if host not in `remotePatterns`** — for the seed's `seed.local` host this never crashes the prerender (next/image only validates at the client `/_next/image` request), but real images on Supabase Storage need their hostname listed (already configured).

**Cart + zustand persist (2026-05-29):**
- **Sync localStorage hydration completes DURING store creation, before any module-level listener registers.** Don't rely on `persist.onFinishHydration(...)` alone for sync storage — the callback has already fired by the time you subscribe. Initialize the local flag from `useCartStore.persist?.hasHydrated()`; keep the listener for any future async storage. Symptom: header cart badge never appears, drawer never opens after add-to-cart.
- **`useCartHasHydrated()` must be built on `useSyncExternalStore`,** not useState+useEffect. The React Compiler's `react-hooks/set-state-in-effect` rule rejects the obvious pattern. SSR snapshot returns `false`; client snapshot reads `persist.hasHydrated()`.
- **`partialize` the persist state** to drop ephemeral fields (`isOpen`) — the drawer should always start closed on a fresh page. Without it, refreshing while the drawer is open re-opens it on every navigation.
- **Cart lines store flattened snapshots, not Product objects** — smaller localStorage, no stale embeds when admin edits a product. Line key = `variantId ?? productId` so same product in two variants is two lines.

**Storefront / landing (2026-05-29):**
- **`unstable_cache` persists across builds in `.next/cache`, keyed only on its keyParts — NOT the target DB.** Switching the build's Supabase target (e.g. live `.env.local` → local) without `rm -rf .next` serves STALE cross-environment data in the static prerender. Burned an hour chasing "why does the local homepage show prod categories." CI is immune (fresh checkout). When verifying a storefront build locally against a different DB: `rm -rf .next` first.
- **`next/image` with an unconfigured remote host does NOT crash the server render.** The hostname check happens at the browser's `/_next/image?url=…` request, so the page prerenders fine and only the `<img>` is broken. Seed images use a fake `seed.local` host — harmless. Real images come from Supabase Storage / Just Kraft CDN (both in `remotePatterns`).
- **Next build env precedence:** a shell-exported `NEXT_PUBLIC_*` wins over `.env.local` at build time (process.env is checked first) — BUT only matters after the `.next/cache` point above is handled.
- **The local Supabase stack can silently degrade** (containers exit under memory pressure — saw 12→1). Symptom: `fetch failed` from the app while `docker exec … psql` still works (DB up, Kong/REST down). Fix: `supabase stop && supabase start`; stop/start preserves the data volume (seed survives).
- **Storefront `<Toaster>`** is mounted in the `(storefront)` layout (admin has its own in `(shell)`); client toasts (copy-address, newsletter) need it.

**Test environment + E2E (2026-05-28):**
- **Soft navigations fire no `load` event.** Server-Action `redirect()` and `<Link>` clicks are client-side navigations. `page.waitForURL(url, { waitUntil: "load" })` HANGS on them. Use `await expect(page).toHaveURL(...)` (polls) or assert a visible element instead.
- **A middleware/proxy redirect during a soft nav renders the target at the OLD url with a dead form action.** This was the 2FA login bug: login→`/admin`→proxy-bounce-to-verify-2fa rendered the 2FA form at URL `/admin` and its Server Action never fired. Fix = redirect DIRECTLY to the final destination from the action; don't rely on a proxy bounce after a Server-Action redirect.
- **`/saved/i` matches "Unsaved changes".** Loose text matchers bite — assert the specific success toast ("Product saved"), or the test reloads before the save commits and races.
- **Next 16 dev blocks cross-origin Server Actions.** Driving `pnpm dev` at `127.0.0.1` while the server's origin is `localhost` silently rejects the action. Set `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts` (dev-only). E2E sidesteps it by running a prod build (`pnpm build && pnpm start`).
- **`getClaims()` falls back to a network call on the LOCAL stack** (HS256 symmetric keys; no JWKS). Prod uses ES256 → local verify. Functionally identical; just slower locally.
- **`supabase db reset` wipes auth users** (re-run `pnpm e2e:seed`) and re-runs `seed.sql`. `supabase start` reads `config.toml` at boot — config changes (e.g. MFA enable) need a `supabase stop && start`.

**New (Phase 2 + Phase 3 planning):**
- **PostgREST caps responses at 1000 rows by default.** Counting via paginated reads silently undercounts and is slow (the `/admin/tags` 3s bug — 8 round-trips, 8K rows). Use a SQL aggregation RPC (`tag_product_counts()`, `attribute_value_counts()`, `products_status_counts()`) — one round-trip.
- **`server-only` cannot be imported by a client component** (throws at build). When a client component needs a runtime constant/type from a server data-layer file, put it in a sibling `*-public.ts` file (no `server-only` import) and import that. See `lib/db/admin/{jobs,images,trash}-public.ts`.
- **React Compiler: `startTransition` must not be called inside a `setState` updater** (it's "during render"). Compute the next value outside the updater, then call `setState(next)` and `startTransition(...)` separately. (The categories-tree `syncUrl`-in-`setExpanded` bug.)
- **React Compiler: `react-hooks/set-state-in-effect` rejects setState-in-useEffect.** Use the `key`-remount pattern instead.
- **`getClaims()` needs asymmetric (ES256) signing keys.** With legacy HS256 it falls back to a network call. Verify via `/auth/v1/.well-known/jwks.json`. The live project is ES256.
- **`updateTag(tag)` for read-your-own-writes; `revalidateTag(tag, profile)` needs a CacheLifeConfig profile.** Next 16 changed the signatures. `middleware.ts` is now `proxy.ts`.
- **Scraped-dupe triage:** 4 "Untitled product" drafts + 2 case-drift dupes were auto-soft-deleted; 78 variant-candidate groups (204 rows, e.g. LMT-5G/8G/15G) are **distinct SKUs flagged for owner review — NOT auto-deleted.** Scripts: `web/scripts/check-product-dupes.mjs`, `cleanup-junk-products.mjs`.
- **`zzz-` test fixtures leaked to prod once** (visible in `/admin/attributes`). `vitest.setup.ts` now has a global `afterAll` calling `purgeZzzFixtures()` so per-suite cleanup misses don't accumulate. Manual purge: `web/scripts/purge-test-fixtures.mjs`.
- **Migration 0010 was a redundant duplicate of a 0003 index; 0011 drops it** (migrations are immutable — never rewrite; add a corrective one). `stock_status` has no `discontinued` value.
- **Test fixtures hit `enforce_publish_state`** (review_status=published requires is_published=true) — set both consistently. `.strict()` Zod schemas reject stray `id` keys in test spreads.

**Carried forward (still true):**
- **Validate migrations against pglite before `supabase db push`.** Zero failed pushes since the validator landed.
- **`@supabase/realtime-js` needs Node 22+** for native WebSocket (CI on 20 caught it; CI is Node 22 now).
- **Vercel build runs `tsc --noEmit` over the tsconfig include** — scripts + tests are excluded from Next's typecheck via `tsconfig.json`.
- **RLS UPDATE/DELETE silently no-op when no policy matches** — they don't raise. Assert "row unchanged," not "operation errored."
- **Multi-word synonyms break Postgres `tsquery`** unless parenthesized as AND groups (`buildTsquery` in `lib/db/search.ts`). **Trigram threshold (0.3) misses typos against long names** — deferred to P3-T19 (fix = per-word tokenize + OR).
- **Hand-rolled Database types collapsed to `never`** under supabase-js v2 — use `supabase gen types typescript --linked` (strip the leading `Initialising login role...` line + trailing `<claude-code-hint .../>`).
- **`web/.env.local` is the source of truth for local dev secrets;** `web/.env.example` is the committed template; CSV/JSON outputs + raw scrape in `data/justkraft-inventory/` are gitignored.

## Conventions specific to this codebase

- Test/temp DB rows use slug prefix `zzz-` (sort last, trivially queryable for residue).
- Slugs match `^[a-z0-9][a-z0-9-]{0,79}$` (CHECK constraint).
- Every migration ends with a `DO $$ ... $$` smoke block asserting its own constraints + cleaning up `zzz-` fixtures.
- Every catalog-mutating server action calls `revalidateTag()`/`updateTag()`/`revalidatePath()` per the mutation map.
- All AI generations land in `ai_generations` with `status='proposed'` first — no auto-apply.
- Soft delete is the default; hard delete needs typed confirmation.
- Route groups: `(storefront)` = public/indexable, `(shell)` = admin/noindex, `(dev)` = dev-only (`/design`, 404 in prod).

---

If anything in this file disagrees with `plans.md` or `progress.md`, those are the truth — update this file. If they all agree, you've got the full picture.
