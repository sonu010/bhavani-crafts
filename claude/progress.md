# Build progress

Last updated: 2026-06-09

## Counts

- ✅ Done: **102** (Phase 0: 11/11 · Phase 1: 11/11 · Phase 1.5 CI · Phase 2: 28/30 · Phase 3: 27/30 + P3.5 polish bundle · Phase 5: 6/10 — P5-T00 task-spec expansion + P5-T01 legal pages + P5-T02 contact/about + P5-T04 OG images + P5-T07 backup verify + P5-T08 RLS attack probe)
- 🟡 In progress: 2 (P2-T01 auth hardening · P2-T03 promote-owner — both **owner-blocked** on creds/smoke)
- 🚧 Blocked: 3 (P3-T26 server `orders.create` · P3-T27 Razorpay widget mount · P3-T28 verify/webhook — all owner-pending `rzp_test_*` keys; scaffolding shipped: orders RPC, `/checkout` page + form, admin Mark-paid/Cancel/Refunded actions for the WhatsApp follow-up path)
- ⏸️ Deferred: **10** (1 from P0 + the 9 Phase 4 AI tasks — owner-paused 2026-06-07; revisit after Phase 5 or as a future paid add-on)
- ⬜ Not started: 3 de-AI'd polish tasks re-homed into Phase 5 (real-content swap, image rehost, blur backfill) + Phase 5 launch-readiness T03, T05, T06, T09, T10

## Phase 2 — admin panel complete (28/30)

Built under `web/src/app/(shell)/admin/**` + `web/src/lib/db/admin/*` (DI pattern). Login + TOTP 2FA + three-layer authz (`proxy.ts` → `requireRole`/`requireAAL2` → RLS) · admin shell (nav tree + Sheet mobile) · 2×3 dashboard · products list (cursor + filters + bulk) · product editor (6 tabs, image upload with file-type sniff/EXIF strip, dnd-kit reorder, publish preview) · categories/tags/attributes admins · CSV import (upload→validate→jobified execute→report) · audit/jobs viewers · Trash (soft-delete, ADR-006). **Open:** P2-T01 (hCaptcha + Upstash creds) + P2-T03 (owner browser smoke) — owner-blocked.

Migrations added in Phase 2: `0008` admin search indexes · `0009` products_status_counts RPC · `0010`/`0011` default-variant index (added then dropped redundant) · `0012` audit indexes · `0013` tag/attribute count RPCs. **Live schema now through 0013** (~11 enums · 20 tables · ~49 indexes · ~40 functions — run `node web/scripts/dump-live-schema.mjs` for exact).

## Phase 3 close-out (shipped 2026-06)

All 30 tasks landed except the 3 owner-blocked Razorpay-keyed ones
(T26 / T27 widget mount / T28). On top of the spec, a P3.5 polish
bundle shipped:

- **App settings** (mig 0020) — k/v table, owner-editable shop name,
  WhatsApp number, Instagram URL, shipping flat rate, anon-readable
  via the public-allowlist policy. Storefront footer / bulk-enquiry
  CTA / checkout shipping all read through `getStorefrontSettings()`
  (`unstable_cache` + `app-settings` tag; admin save flushes it).
- **Admin orders cluster** — /admin/orders viewer with search +
  status chips + CSV export · /admin/orders/<id> detail · status
  flip actions (Mark paid / Cancel / Mark refunded) + best-effort
  stock decrement (mig 0019) per ADR-011 §5 · dashboard
  pending-orders banner.
- **Checkout flow** (T25 + T27 sans Razorpay widget) — `/checkout`
  page with controlled form + cart summary + `createCheckoutOrder`
  server action (price re-resolution + the `create_anon_order` RPC
  in mig 0018) → `/checkout/pending` with WhatsApp follow-up CTA.
- **Storefront polish** — header search Sheet · skip-link · 360px
  mobile pass · safe-area insets · LCP image opt-in for the
  hero/PDP first image · category filter refresh (drop availability,
  add sort + sub-category chips).
- **Test coverage** — from 25 files / 194 tests at the start of the
  session → **59 files / 452 tests** at close-out. Plus 1 anon
  Playwright spec (anon checkout) + 1 admin spec (orders Mark-paid)
  on top of the existing E2E suite.

Migrations through Phase 3 close-out: 0001-0014 (Phase 1+2) +
**0015** orders schema + **0016** anon order_items RPC fix +
**0017** order_number column default + **0018** create_anon_order
RPC + **0019** decrement_product_stock + **0020** app_settings.
Live schema now: 12 enums · 23 tables · 58 indexes · 46 functions.

## Phase 5 — launch readiness (in flight)

P5-T00 (task-spec expansion) + P5-T01 (legal pages) + P5-T08 (RLS
attack probe) shipped 2026-06-09.

- **P5-T04 — OG images per route family** — three dynamic OG
  handlers via Next 16's `opengraph-image.tsx` file convention:
  global home + category + PDP. Shared template at
  `web/src/lib/storefront/og-template.tsx` keeps the four cards
  visually consistent. Verified locally: each renders a 1200×630
  PNG (~35–55 KB). Found Satori-no-WebP gotcha — entire catalogue
  is WebP so the PDP handler strips WebP URLs and renders
  text-only; promoting to inline images is a follow-up gated on
  non-WebP backfill (P4-T11 image rehost). 24h revalidate on each
  handler. E2E spec verifies meta-tag → 200 image of the expected
  dimensions, with the URL rebased to Playwright's baseURL so it
  works in any environment.

- **P5-T07 — backup verify + restore drill** — `pnpm backup:live`
  works against live (37,390 rows, 11 catalog tables snapshotted to
  `web/backups/20260609-022330/`). `pnpm restore:live <dir>`
  dry-run reports same 37,390 rows would upsert with correct
  on-conflict keys. Workflow hardened: `retention-days: 30` paired
  with quarterly cold-copy step; manifest sanity-check fails the
  run if products/images came back < 100 rows (catches auth-blip
  silent successes); `if: failure()` breadcrumb step makes failed
  Actions logs scannable. Runbook updated with retention policy +
  last-verified date. **Launch-readiness gap caught**: workflows
  live on `rebuild-v2` but GitHub schedules only fire from the
  default branch (`main`, currently the old prototype tree).
  Cutover documented in `blockers.md` + as part of P5-T10
  go-live.

- **P5-T02 — Contact + About pages** — `/about` (brand story, 3
  paragraphs, placeholder studio photo) + `/contact` (WhatsApp +
  email + address + hours + Google Maps deep-link). Both
  prerender as `○` static. Contact reuses the existing
  `CopyAddress` client + `whatsappHref()` helper + reads
  WhatsApp/Instagram from `getStorefrontSettings()`. Email is a
  hardcoded DRAFT placeholder (promotion to `app_settings`
  documented as a follow-up). Footer wires both: "Our story →"
  in the brand column, "Contact us" in the contact column.
  Sitemap STATIC_ROUTES extended. E2E spec
  `web/e2e/anon/about-contact.spec.ts` covers render + canonical
  + sitemap + footer + back-link.

- **P5-T08 — RLS attack probe** — `pnpm rls-attack` (local) / `pnpm
  rls-attack --live` (production). Anon-only sweep across every
  public table from migrations 0001-0020: 40/40 probes pass on
  live. Hard-refuses if `SUPABASE_SERVICE_ROLE_KEY` is exported in
  the caller's env (so the test posture is real). Strict 42501
  assertions for the high-value tables (products, categories,
  audit_logs, app_settings, orders); broad "any error counts"
  sweep for composite-PK / lightly-constrained tables. Orders
  contract verified both halves: pending_payment INSERT allowed,
  status=paid INSERT denied. CI workflow
  `.github/workflows/rls-attack.yml` runs it weekly (Mon 03:00 UTC)
  + on push to main when any migration changes + manual dispatch.
  Probe-inserted fixture order tagged `customer_name = ZZZ-RLS-
  ATTACK-PROBE`; `purge-test-fixtures.mjs` sweeps it.


- **P5-T01 — Legal pages** — `/policies/{privacy,terms,shipping,returns}`
  live with a shared `prose` layout (max-w-3xl, back-to-home link,
  Last-updated footer). All four prerender as `○` static. Shipping
  policy reads the live flat-rate ₹ amount through
  `getStorefrontSettings()` so the page can't contradict checkout.
  Sitemap STATIC_ROUTES now includes the four URLs; footer adds the
  "Terms" link (already had the other three). E2E spec
  `web/e2e/anon/policies.spec.ts` covers: 200 + heading + body > 200
  chars + canonical + sitemap inclusion + robots-not-blocking +
  inter-policy cross-links. Razorpay due-diligence dependency
  cleared (live keys can now be requested once T26/T27/T28 land).
  Content is DRAFT (flagged per file in a JSDoc comment) pending
  owner review before go-live.

Open Phase 5 tasks: T02 contact/about · T03 sitemap+GSC · T04 OG
images · T05 analytics+Sentry · T06 broken-image cron · T07 backup
verify · T08 RLS attack test · T09 final QA · T10 go-live · plus
the three de-AI'd polish tasks (P4-T10 content swap · P4-T11 image
rehost · P4-T12 blur backfill) re-homed into Phase 5.

## Phase 4 — DEFERRED (2026-06-07)

Owner paused the AI tasks (T01–T09) — to be revisited after Phase 5
or in a later month as a potential paid add-on. Storefront ships
without AI assists; admin handles category/tag/alt-text/description
entry manually as it does today. Phase 4 task files stay parked
with `status: deferred`; T10/T11/T12 (the de-AI'd polish trio) are
re-homed into Phase 5. See [plans.md](plans.md) §"Phase 4" for the
deferral note and [architecture/overview.md](architecture/overview.md)
§"What's deliberately not in MVP" for the canonical reason.

## Phase 0 + 1 + 1.5 — complete

### Phase 1 schema (live Supabase project `lyycugadkxjtevmugqol`)

```
0001_init.sql                    profiles, categories, products + 4 enums
0002_attributes.sql              attribute_definitions, product_attributes + 1 enum, 7 seeded
0003_variants_images_tags.sql    images (license-tracked), options/values, variants, tags + 2 enums
0004_ops_tables.sql              audit_logs, jobs, imports, ai_generations + 4 enums + publish-state trigger
0005_search.sql                  products.fts + GIN/trigram + search_synonyms (7 seeded) + search_logs
0006_rls.sql                     RLS on all 20 tables; 33 policies; child-parent EXISTS pattern
0007_indexes_views.sql           9 catalog indexes + category_with_descendants recursive view

Live schema: migrations through 0013 (~11 enums · 20 tables · ~49 indexes · ~40 functions)
             (0008 slug trigram + review_status index; 0009 products_status_counts();
              0010+0011 default-variant index add/drop; 0012 audit indexes;
              0013 tag_product_counts() + attribute_value_counts())
             Run `node web/scripts/dump-live-schema.mjs` for exact counts.

Catalog:     seeded from data/justkraft-inventory/justkraft_products.cleaned.json
             (~5.8K products). All rows is_published=false, source='justkraft_seed',
             RLS-blocked from anon.

             Exact current counts:
               node web/scripts/count-live-products.mjs       — live row counts
               data/justkraft-inventory/seed_report.json      — last reseed totals
               node web/scripts/dump-live-schema.mjs          — full schema snapshot
```

### Phase 1.5 — Continuous Integration

- `.github/workflows/ci.yml` — `static` (always) + `live` (gated on secrets). Green on `f1b58e0`, `445d21e`.
- `pnpm validate:migrations` — pglite Postgres 17 validator. ~6s.
- `pnpm launch-blockers` — 12 checks (7 SQL + 5 RLS attack probes). Deploy gate.
- See [architecture/testing-and-ci.md](architecture/testing-and-ci.md) + [ADR-010](decisions/ADR-010-pglite-and-di-supabase.md).

## What runs locally today

| Command (from `web/`) | Purpose | Time |
|---|---|---|
| `pnpm dev` | Local dev server on :3000 | instant |
| `pnpm build` | Production build (same as Vercel) | ~30s |
| `pnpm lint` | ESLint over `src/` | ~3s |
| `pnpm exec tsc --noEmit` | Strict typecheck | ~3s |
| `pnpm validate:migrations` | All 7 migrations through pglite | ~6s |
| `pnpm launch-blockers` | 12 deploy-gate checks against live | ~12s |
| `pnpm exec vitest run __tests__/db/` | 21 data-layer integration tests vs live | ~10s |
| `node scripts/seed-from-justkraft.mjs` | Wipe + re-seed Just Kraft dev catalog | ~30s |
| `node scripts/dump-live-schema.mjs` | Refresh schema-doc appendix | ~10s |

## Live deployments

- **Production**: https://bhavani-crafts.vercel.app/ — legacy prototype from `origin/main`. Untouched.
- **Preview**: https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/ — `rebuild-v2`. `/` Phase-0 placeholder · `/api/health` returns `{"ok":true}` · `/design` returns 404 in production (dev-only).

## Commit history (most recent first — Phase 2 + Phase 3 start)

```
7d34e82  P3-T29 (partial) — Playwright E2E harness + admin critical-flow specs
f05d810  P3-T01 — public storefront layout + nav + shared ProductCard
6fb1dca  docs: add architecture/performance.md (cross-phase reference)
d138f75  docs(p3): bake the storefront performance contract into task specs
771f44f  perf(admin): proxy verifies JWT locally (getClaims) not getUser
3cf902e  P3-T00 — expand Phase 3 storefront task files + add missing tasks
f4e8b85  P2-T23/T24/T25 — CSV import: upload + validate + apply + report
aa8b88d  P2-T09 — products list bulk actions
c7f00de  fix(admin): tree React error, zzz leak, /admin/tags 3s, scraped dupes
8727ab9  P2-T29 — admin mobile pass at 360px
dc4c64c  P2-T28 — Trash + soft-delete recovery at /admin/trash
c234ac2  P2-T27 — background jobs viewer at /admin/jobs
c555477  P2-T26 — audit log viewer at /admin/activity
a5559bf  P2-T22 — attribute definitions admin at /admin/attributes
6ecc78c  P2-T21 — tags admin at /admin/tags
(… earlier P2-T01 through P2-T20 + the migrations 0008–0013 …)
```

## Commit history at Phase 1 + 1.5 close

```
445d21e  chore: clear lint warnings + fix broken test assertion
f1b58e0  P1.5: GitHub Actions CI (static + live-Supabase gated)
0d9d5d9  fix(build): inline srvCount helper + exclude dev tooling from build typecheck
cdb0999  P1-T10 + P1-T11: launch-blockers script + verified schema doc — Phase 1 closes
518ffee  P1-T09: typed data layer + 21 integration tests, all green
601ad6f  P0-T10 done (Vercel verified) + P1-T08 done (7,780 products seeded on live)
f8ebe8e  P1-T06 + P1-T07: RLS lockdown + catalog indexes + recursive view
2c0d2a6  P1-T03/T04 done + P1-T05 applied: FTS + trigram + synonyms + search_logs
4c1acab  Adopt engineering principles; audit-fix 3 violations
a408e0f  P1-T02 done + P1-T03 + P1-T04: variants/images/tags + ops tables
e518018  P1-T01 done + P1-T02: attributes migration + pglite validator harness
136ab02  P1-T01: fix smoke-block slugs to comply with the check constraint they're testing
035d028  P1-T01: fix is_admin() ordering — must follow profiles table CREATE
268a50c  P1-T01: migration 0001_init.sql — core tables (profiles, categories, products)
289f813  P0-T11: security headers + image remotePatterns + Phase 0 wrap-up
c369523  P0-T06 + P0-T07 + P0-T08 + P0-T09: shadcn primitives, design system, Supabase clients
e40a3d8  P0-T02 + P0-T04: archive legacy prototype, scaffold fresh Next.js 16 app
838c7a3  Option B layout: move git to project root, rebuild-v2 initial commit
```

## Awaiting owner action

- **Razorpay test keys** — gate before P3-T26 (payments cluster).
- **hCaptcha keys + Upstash creds** — finish P2-T01 hardening (login works without them; they add captcha + rate-limit layers).
- **P2-T03 browser smoke** — owner signs in + verifies 2FA once on the real owner account to close promote-owner.
- **First local E2E run** — Docker + `supabase start`/`db reset` + `pnpm e2e:seed` + `pnpm test:e2e` (see `web/e2e/README.md`).
- _(resolved)_ GitHub Actions secrets — configured; `live` CI job runs green on every push.

## Non-blocking follow-ups

- _(resolved 2026-05-17)_ ~~Re-seed live with the cleaned fixture.~~ Done — `scripts/clean-justkraft-inventory.mjs` rejected the scrape-failure rows + normalized SKUs into `data/justkraft-inventory/justkraft_products.cleaned.json`; the seed script chunked its cleanup pass to clear Supabase's statement timeout (commit `309826f`); live now reflects the cleaned fixture.

## Next 3 to work (Phase 3 storefront)

1. **P3-T25** — orders schema migration + payments ADR (**gate for the Razorpay cluster T26–T28**; needs owner's Razorpay test keys). The cart already shapes lines for this; T25 unblocks the checkout build.
2. **P3-T22** — mobile pass at 360px audit (`/c`, `/p`, `/search`, cart drawer, header sheet). Probably 1-2 small CSS fixes.
3. **P3-T23** — Lighthouse pass against `architecture/performance.md` budgets (cached TTFB <200ms, LCP <2.5s).

Every Phase 3 task honors `architecture/performance.md` (cacheable reads via `createPublicClient` + `unstable_cache` tags; budgets) and the cross-cutting patterns (DI client, soft delete, audit logs, revalidate tags, targeted `git add`).

## Notes log (most recent first)

- 2026-05-29 — **Phase 3 SEO (P3-T24).** Built `app/sitemap.ts` (paginated published products + categories + static routes, `lastmod` from `updated_at`, route `revalidate=3600`, wrapped in `readOrEmpty` for DB-outage resilience) + `app/robots.ts` (allow `/`, disallow `/admin /auth /api /design`, points at sitemap). Added `listAllPublishedSlugs` / `listAllCategorySlugs` data-layer helpers (1000-row paginated). PDP + category metadata now emit `alternates.canonical` + full `openGraph` set (PDP also includes `twitter` card). Root layout sets `metadataBase` + `title.template` so every per-page string title gets " — Bhavani Crafts" appended automatically. Stripped " — Bhavani Crafts" from 22 page titles (root template applies it universally). Gotcha closed: setting `title` (even `{ absolute }`) in `(storefront)/layout.tsx` overrode the root template for every descendant, silently dropping the suffix on PDP/category. Fix: put the tagline in `title.default` at root (defaults are NOT templated) and drop the storefront override. All verified: 5 new anon SEO E2E specs assert robots disallows + sitemap entries (incl. unpublished-leak check) + PDP/category canonical + og tags + title-template wrap. **All 41 E2E pass** in 34.7s.
- 2026-05-29 — **Phase 3 cart cluster (P3-T20–T21).** Built `lib/storefront/cart-store.ts` (zustand + persist `bc-cart-v1`, variant-aware line shape keyed by `variantId ?? productId`, flattened snapshots, `selectTotalItems`/`selectSubtotalInr`). Built `components/storefront/cart-drawer.tsx` (Sheet right/bottom, qty steppers, line totals, remove ×, subtotal, Checkout → `/checkout`). Wired the header cart icon + count badge + open-on-add. Rewrote PDP `add-to-cart.tsx` to take a single `line` snapshot prop; variant-selector now builds variant labels ("Small / Teal") + passes the resolved unit price. Two big gotchas closed: (1) sync localStorage hydration finishes during store creation, so initialize `hasHydrated` from `persist.hasHydrated()` not just the listener; (2) `useCartHasHydrated` is built on `useSyncExternalStore` because the React Compiler's `react-hooks/set-state-in-effect` rule rejects the obvious useState+useEffect pattern. **All 36 E2E pass** (4 new cart specs: drawer-opens-on-add, qty stepper updates, persistence across reload + badge, variant-keyed lines + remove + checkout link).
- 2026-05-29 — **E2E admin coverage batch (8 new admin specs).** Lifecycle (create draft → edit → soft-delete → restore → hard-delete), bulk (multi-select via header checkbox → bulk soft-delete with typed `delete`), categories (create → rename → soft-delete → restore), tags×2 (create + soft-delete; create+merge), attributes (CRUD), imports (CSV upload via setInputFiles → validate → run → catalog), audit (action recorded). Shared `_helpers.ts`. Locked the 11 conventions in `e2e/README.md`. Cleaned up admin-chrome to be opt-in via `E2E_CHROME=1`. From 24 → 32 E2E specs.
- 2026-05-29 — **Phase 3 search + JSON-LD (P3-T17–T19).** Built `/search?q=` (FTS via existing `searchProducts`, batched primary images via new `searchProductCards`, empty state + min-2-char guard, plain GET-form for SSR/shareable). Search logging through the anon client — migration `0014_search_logs_anon_insert.sql` adds an INSERT-only RLS policy + length CHECK + pglite-validated smoke (correct architecture answer; `@/lib/db/admin` import restriction stays intact). Log insert runs in Next 16's `after()` so the user pays no latency. Product JSON-LD on PDP: schema.org Product with Brand + image array + Offer/AggregateOffer (INR + availability mapped from stock_status); markdown-stripped description, `<`-escaped for safety, **skipped on preview renders**. New `lib/storefront/site-url.ts` (NEXT_PUBLIC_SITE_URL → VERCEL_URL → localhost). T19 was verification-only — all 7 craft synonyms already seeded, 14 vitest specs green; trigram threshold parked per the documented known issue. Schema now through 0014. All green: 239 vitest · **24 E2E** (6 new: 4 search + 2 JSON-LD).
- 2026-05-29 — **Phase 3 PDP cluster (P3-T13–T16).** Built `/p/[slug]`: cached public read + uncached service-role preview path (token-bound to product id, banner + `robots:noindex`), gallery with keyboard arrows + touch swipe + thumb tabs, variant selector resolving by set-equality on `option_value_ids` (default preselected, price/stock fall back to product base, add-to-cart disabled with reason on invalid combo / out-of-stock), markdown description (`react-markdown` + `rehype-sanitize`), attributes table, related-products scroll-snap row (same category fallback to newest overall). New `lib/db/pdp.ts` composing PdpView; new `getPdpVariantBundle` public-safe mirror of admin variants bundle. Extended seed with a `resin-coaster-set` (Size×Color, 4 variants, one out_of_stock + one low_stock) so the variant selector has a real happy path. Preview-token round-trip verified live (valid → 200 + banner; tampered → 404; wrong-product → 404). All green: 239 vitest · **18 E2E** (5 new PDP specs).
- 2026-05-29 — **Fixed admin filter-bar infinite loop + Phase 3 category cluster (P3-T10–T12).** (1) `/admin/activity` + `/admin/jobs` filter bars looped (`useEffect`→`router.replace`→new `searchParams`→recreated callback→re-fire, ~3×/sec) — continuous `GET`s, blocked navigation. Fixed: build query from local state, no `searchParams` dep, no-op guard. Regression spec `e2e/admin/navigation.spec.ts`. Hardened `e2e/seed-admin.ts` (unique TOTP friendlyName). (2) Built `/c/[slug]`: cached category lookup + descendant-scoped product grid, URL-driven price/stock filter sidebar (event-only, safe pattern), Load-more cursor pagination (server-action append). Added `getProductCardsPage`, cursor codec, `lib/storefront/safe-read.ts` (ISR build resilience — the homepage now fetches at build, so reads degrade gracefully if the DB is unreachable). All green: 239 vitest · 13 E2E (3 new category specs incl. descendant scoping + server-side filtering) · build (`/` static, `/c/[slug]` dynamic).
- 2026-05-29 — **Phase 3 landing page (P3-T02–T09).** Built the full editorial homepage: split hero, caption strip, Atlas category grid, weekly collection, workshop-kits row, bulk-enquiry WhatsApp strip, visit section, 4-col footer. New `lib/db/storefront.ts` shared read helper (`getProductCards`, `getCategoryCovers`) + `onlyFeatured` opt on `listProducts` + `lib/storefront/whatsapp.ts`. Extended `supabase/seed.sql` (featured products + workshop-kits) so every section has data and a happy-path E2E. Added 2 anon landing E2E specs. All green on local: 239 vitest · 12 launch-blockers · 8 E2E; `/` stays `○ Static, Revalidate 5m`. Gotcha learned: `unstable_cache` persists across builds in `.next/cache` keyed only on keyParts, not the DB target — `rm -rf .next` when switching the build's Supabase target.
- 2026-05-28 — **Test environment + prod-data isolation + 2FA login fix.** Stood up a disposable LOCAL Supabase stack as the target for ALL fixture-creating tests (vitest + launch-blockers + Playwright) — production is no longer written by the test pipeline. Added: `pnpm test:setup`/`db:reset:test`/`test:e2e:setup`, `scripts/write-test-env.mjs`, hard non-local guardrails in `vitest.setup.ts` + `_clients.ts` (override `ALLOW_NONLOCAL_TEST_DB=1`), `supabase/seed.sql` (deterministic catalog), local `config.toml` MFA enable. Backup/rollback: `scripts/backup-live.mjs` (read-only paginated JSON snapshot — captured 37,387 live rows) + `scripts/restore-live.mjs` (dry-run default, typed-host confirm) + `runbooks/backup-and-restore.md` + nightly read-only `backup.yml` CI workflow. CI reworked: `static` + `integration` (local) + `e2e` (local); destructive `live` job removed. **Caught + fixed a real 2FA login bug:** post-password proxy soft-bounce rendered `/auth/verify-2fa` at URL `/admin` with a dead form action (no owner could finish logging in) — login now redirects directly to the MFA step. All green on local: 239 vitest · 12 launch-blockers · 6 E2E.
- 2026-05-28 — **Session-resume + progress docs refreshed** for handoff to a new chat. Reflects Phase 2 built (28/30; T01/T03 owner-blocked), Phase 3 planned + T01 built, migrations through 0013, the Razorpay scope addition, performance.md + the `getClaims` proxy fix, the E2E harness, and the new gotchas (PostgREST 1000-row cap, `server-only`/`-public` split, startTransition-in-render, `createPublicClient` for cached reads, ES256/getClaims, global zzz-purge).
- 2026-05-18 — **Phase 3 planning (P3-T00).** Expanded all 30 storefront stubs; added the Razorpay payments cluster (T25–T28), SEO (T24), and Playwright E2E (T29). Built P3-T01 (public layout + nav + ProductCard). Wrote `architecture/performance.md` and applied the `getClaims` admin-auth optimization in `proxy.ts`.
- 2026-05-17/18 — **Phase 2 admin panel built (T01–T29).** Auth + 2FA + three-layer authz · admin shell · dashboard · products list + editor + image pipeline · categories/tags/attributes · CSV import (jobified) · audit/jobs/trash viewers. Migrations 0008–0013. Fixed: tabs overflow, categories-tree React error, zzz fixture leak, /admin/tags 3s load (RPC), scraped-dupe triage.
- 2026-05-16 — **Doc audit + cold-start hygiene.** Added `architecture/testing-and-ci.md` and `ADR-010` to capture the DI-Supabase-client + pglite patterns durably. Fixed P0-T03 status drift (`not_started` → `deferred`). Refreshed engineering-principles audit log.
- 2026-05-16 — **CI live.** GitHub Actions workflow runs lint + tsc + validate:migrations + build on every push; vitest + launch-blockers on `rebuild-v2`. Two consecutive green runs.
- 2026-05-16 — **First Vercel build failure caught a hidden test bug.** `expect(p.base_price_inr).toBeNull;` was missing parens — never ran. CI annotations surfaced it.
- 2026-05-16 — **Phase 1 closed.** P1-T10 (launch-blockers, 12/12) + P1-T11 (schema doc verified appendix).
- 2026-05-16 — **P1-T09 done.** Data layer + Zod + 21 integration tests on live.
- 2026-05-15 — **P1-T08 done.** 7,780 products seeded on live; RLS-blocked from anon.
- 2026-05-15 — **P1-T06 + P1-T07 done.** RLS lockdown + recursive view.
- 2026-05-15 — **Engineering principles adopted.** Audit-fix corrected 3 violations.
- 2026-05-15 — **P1-T05 applied.** AI runs `db push` itself from here.
- 2026-05-15 — **Vercel preview verified end-to-end.**
- 2026-05-15 — **Option B applied.** Git relocated to project root.
- 2026-05-15 — **Supabase project linked** (`lyycugadkxjtevmugqol`).
- 2026-05-15 — Plan v2.1 approved.
