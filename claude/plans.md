# Bhavani Crafts — Build Plan Index

Owner: Vignesh · Last updated: 2026-05-15 · Master plan: `~/.claude/plans/i-just-web-scraped-goofy-bubble.md`

## Status legend

- ⬜ not started · 🟡 in progress · ✅ done · 🚧 blocked · ⏸️ deferred

## Read me first (architecture + decisions)

- [README](README.md) — how to use this folder
- [architecture/overview.md](architecture/overview.md)
- [architecture/database-schema.md](architecture/database-schema.md)
- [architecture/design-system.md](architecture/design-system.md)
- [architecture/auth-and-roles.md](architecture/auth-and-roles.md)
- [architecture/caching-and-revalidation.md](architecture/caching-and-revalidation.md)
- [architecture/search.md](architecture/search.md)
- [architecture/image-pipeline.md](architecture/image-pipeline.md)
- [architecture/background-jobs.md](architecture/background-jobs.md)
- [architecture/observability.md](architecture/observability.md)
- [architecture/security.md](architecture/security.md)
- [architecture/ai-workflow.md](architecture/ai-workflow.md)
- ADRs 001–009 in [decisions/](decisions/)
- Runbooks in [runbooks/](runbooks/)

---

## Phase 0 — Setup & archival   (aggressive ½ day · realistic 1–1½ days)

- ✅ [P0-T01: Materialize the claude/ folder](tasks/phase-0-setup/P0-T01-materialize-claude-folder.md) — no deps
- ✅ [P0-T02: Archive old web/](tasks/phase-0-setup/P0-T02-archive-old-web.md) — revised: legacy preserved on main + pre-rebuild tag
- ⏸️ [P0-T03: Extract reusable bits from web-legacy](tasks/phase-0-setup/P0-T03-extract-reusable-bits.md) — deferred: pull when needed (cart store in P3-T21)
- ✅ [P0-T04: Scaffold fresh Next.js app at web/](tasks/phase-0-setup/P0-T04-scaffold-next-app.md) — Next 16.2.6 + React 19.2.4 + Tailwind v4
- ✅ [P0-T05: Install core dependencies](tasks/phase-0-setup/P0-T05-install-core-deps.md) — runtime + dev/test deps in
- ✅ [P0-T06: Install shadcn/ui primitives](tasks/phase-0-setup/P0-T06-install-shadcn.md) — 17 components installed
- ✅ [P0-T07: Write design tokens (CSS vars + Tailwind theme)](tasks/phase-0-setup/P0-T07-write-design-tokens.md) — Bhavani palette + Newsreader/Manrope/JetBrains Mono + `/design` gallery
- ✅ [P0-T08: Create Supabase project + wire env](tasks/phase-0-setup/P0-T08-create-supabase-project.md) — project `lyycugadkxjtevmugqol`, env wired locally
- ✅ [P0-T09: Wire Supabase clients (browser/server/admin)](tasks/phase-0-setup/P0-T09-wire-env-and-clients.md) — health check returns `connected`
- 🟡 [P0-T10: Git init + GitHub + Vercel link](tasks/phase-0-setup/P0-T10-git-and-vercel.md) — git + GitHub done; Vercel config awaits owner action per user/06
- ✅ [P0-T11: Set security headers in next.config](tasks/phase-0-setup/P0-T11-set-security-headers.md) — all 6 headers verified

---

## Phase 1 — Data foundation   (aggressive 2 days · realistic 3–4 days)

- ✅ [P1-T01: Migration — core tables (profiles, categories, products)](tasks/phase-1-foundation/P1-T01-migration-core-tables.md) — applied to live Supabase
- 🟡 [P1-T02: Migration — attributes (definitions + product_attributes)](tasks/phase-1-foundation/P1-T02-migration-attributes.md) — SQL written + validated locally; awaits `supabase db push`
- ⬜ [P1-T03: Migration — variants + options model](tasks/phase-1-foundation/P1-T03-migration-variants-options.md) — depends P1-T01
- ⬜ [P1-T04: Migration — ops tables (audit_logs, jobs, imports, ai_generations)](tasks/phase-1-foundation/P1-T04-migration-ops-tables.md) — depends P1-T01
- ⬜ [P1-T05: Migration — search (synonyms, search_logs, FTS + trigram)](tasks/phase-1-foundation/P1-T05-migration-search.md) — depends P1-T01
- ⬜ [P1-T06: RLS policies (incl. child-parent EXISTS) + RLS attack test](tasks/phase-1-foundation/P1-T06-rls-policies.md) — depends P1-T02, P1-T03, P1-T04, P1-T05
- ⬜ [P1-T07: Indexes + category_with_descendants view](tasks/phase-1-foundation/P1-T07-indexes-and-views.md) — depends P1-T06
- ⬜ [P1-T08: Seed script — streaming Just Kraft JSON](tasks/phase-1-foundation/P1-T08-seed-script-streamed.md) — depends P1-T07
- ⬜ [P1-T09: Typed data layer (lib/db/* with Zod)](tasks/phase-1-foundation/P1-T09-typed-data-layer.md) — depends P1-T07
- ⬜ [P1-T10: Verify seed counts and RLS sanity](tasks/phase-1-foundation/P1-T10-verify-seed-counts.md) — depends P1-T08, P1-T09
- ⬜ [P1-T11: Author architecture/database-schema.md fully](tasks/phase-1-foundation/P1-T11-write-database-schema-doc.md) — depends P1-T10

---

## Phase 2 — Admin panel   (aggressive 4–5 days · realistic 7–10 days)

**Entry task** = expand the stubs in this phase with lessons learned from Phase 1.

- ⬜ [P2-T00: Expand Phase 2 task files](tasks/phase-2-admin/P2-T00-expand-phase-tasks.md) — depends P1-T11
- ⬜ [P2-T01: Supabase Auth (email + password)](tasks/phase-2-admin/P2-T01-supabase-auth-email.md) — stub, depends P2-T00
- ⬜ [P2-T02: profiles table + trigger](tasks/phase-2-admin/P2-T02-profiles-table-and-trigger.md) — stub, depends P2-T01
- ⬜ [P2-T03: Promote owner runbook](tasks/phase-2-admin/P2-T03-promote-owner-runbook.md) — stub, depends P2-T02
- ⬜ [P2-T04: Middleware admin gate](tasks/phase-2-admin/P2-T04-middleware-admin-gate.md) — stub, depends P2-T02
- ⬜ [P2-T05: Admin shell layout](tasks/phase-2-admin/P2-T05-admin-shell-layout.md) — stub, depends P2-T04
- ⬜ [P2-T06: Admin dashboard](tasks/phase-2-admin/P2-T06-admin-dashboard.md) — stub, depends P2-T05
- ⬜ [P2-T07: Products list (cursor paginated)](tasks/phase-2-admin/P2-T07-products-list-cursor-paginated.md) — stub, depends P2-T05
- ⬜ [P2-T08: Products list — filters + search](tasks/phase-2-admin/P2-T08-products-list-filters-and-search.md) — stub, depends P2-T07
- ⬜ [P2-T09: Products list — bulk actions](tasks/phase-2-admin/P2-T09-products-list-bulk-actions.md) — stub, depends P2-T07
- ⬜ [P2-T10: Product editor shell](tasks/phase-2-admin/P2-T10-product-editor-shell.md) — stub, depends P2-T07
- ⬜ [P2-T11: Product editor — basic fields](tasks/phase-2-admin/P2-T11-product-editor-basic-fields.md) — stub, depends P2-T10
- ⬜ [P2-T12: Product editor — category picker](tasks/phase-2-admin/P2-T12-product-editor-category-picker.md) — stub, depends P2-T11
- ⬜ [P2-T13: Product editor — attributes](tasks/phase-2-admin/P2-T13-product-editor-attributes.md) — stub, depends P2-T11
- ⬜ [P2-T14: Product editor — variants](tasks/phase-2-admin/P2-T14-product-editor-variants.md) — stub, depends P2-T11
- ⬜ [P2-T15: Product editor — image upload](tasks/phase-2-admin/P2-T15-product-editor-images-upload.md) — stub, depends P2-T11
- ⬜ [P2-T16: Product editor — image reorder](tasks/phase-2-admin/P2-T16-product-editor-images-reorder.md) — stub, depends P2-T15
- ⬜ [P2-T17: Product editor — publish + preview](tasks/phase-2-admin/P2-T17-product-editor-publish-preview.md) — stub, depends P2-T11
- ⬜ [P2-T18: Categories tree view](tasks/phase-2-admin/P2-T18-categories-tree-view.md) — stub, depends P2-T05
- ⬜ [P2-T19: Categories edit + create](tasks/phase-2-admin/P2-T19-categories-edit-and-create.md) — stub, depends P2-T18
- ⬜ [P2-T20: Categories — move products](tasks/phase-2-admin/P2-T20-categories-move-products.md) — stub, depends P2-T19
- ⬜ [P2-T21: Tags management](tasks/phase-2-admin/P2-T21-tags-management.md) — stub, depends P2-T05
- ⬜ [P2-T22: Attribute definitions admin](tasks/phase-2-admin/P2-T22-attribute-definitions-admin.md) — stub, depends P2-T05
- ⬜ [P2-T23: CSV import — upload + validate](tasks/phase-2-admin/P2-T23-csv-import-upload-and-validate.md) — stub, depends P2-T11
- ⬜ [P2-T24: CSV import — execute (jobified)](tasks/phase-2-admin/P2-T24-csv-import-execute-jobified.md) — stub, depends P2-T23
- ⬜ [P2-T25: CSV import — report](tasks/phase-2-admin/P2-T25-csv-import-report.md) — stub, depends P2-T24
- ⬜ [P2-T26: Audit log viewer](tasks/phase-2-admin/P2-T26-audit-log-viewer.md) — stub, depends P2-T05
- ⬜ [P2-T27: Background jobs viewer](tasks/phase-2-admin/P2-T27-background-jobs-viewer.md) — stub, depends P2-T05
- ⬜ [P2-T28: Soft-delete trash view](tasks/phase-2-admin/P2-T28-soft-delete-trash-view.md) — stub, depends P2-T07
- ⬜ [P2-T29: Admin mobile pass](tasks/phase-2-admin/P2-T29-admin-mobile-pass.md) — stub, depends P2-T28

---

## Phase 3 — Public storefront   (aggressive 3 days · realistic 5–7 days)

**Entry task** = expand the stubs in this phase with lessons learned from Phase 2.

- ⬜ [P3-T00: Expand Phase 3 task files](tasks/phase-3-storefront/P3-T00-expand-phase-tasks.md) — depends P2-T29
- ⬜ [P3-T01: Public layout + nav](tasks/phase-3-storefront/P3-T01-public-layout-and-nav.md) — stub
- ⬜ [P3-T02: Landing — hero](tasks/phase-3-storefront/P3-T02-landing-hero.md) — stub
- ⬜ [P3-T03: Landing — caption strip](tasks/phase-3-storefront/P3-T03-landing-caption-strip.md) — stub
- ⬜ [P3-T04: Landing — Atlas (category grid)](tasks/phase-3-storefront/P3-T04-landing-atlas-categories.md) — stub
- ⬜ [P3-T05: Landing — weekly collection](tasks/phase-3-storefront/P3-T05-landing-weekly-collection.md) — stub
- ⬜ [P3-T06: Landing — kits row](tasks/phase-3-storefront/P3-T06-landing-kits-row.md) — stub
- ⬜ [P3-T07: Landing — bulk enquiry](tasks/phase-3-storefront/P3-T07-landing-bulk-enquiry.md) — stub
- ⬜ [P3-T08: Landing — visit section](tasks/phase-3-storefront/P3-T08-landing-visit-section.md) — stub
- ⬜ [P3-T09: Public footer](tasks/phase-3-storefront/P3-T09-public-footer.md) — stub
- ⬜ [P3-T10: Category page shell](tasks/phase-3-storefront/P3-T10-category-page-shell.md) — stub
- ⬜ [P3-T11: Category filters sidebar](tasks/phase-3-storefront/P3-T11-category-filters-sidebar.md) — stub
- ⬜ [P3-T12: Category cursor pagination](tasks/phase-3-storefront/P3-T12-category-pagination-cursor.md) — stub
- ⬜ [P3-T13: Product detail page](tasks/phase-3-storefront/P3-T13-product-detail-page.md) — stub
- ⬜ [P3-T14: Product detail — gallery](tasks/phase-3-storefront/P3-T14-product-detail-gallery.md) — stub
- ⬜ [P3-T15: Product detail — variants UI](tasks/phase-3-storefront/P3-T15-product-detail-variants-ui.md) — stub
- ⬜ [P3-T16: Related products](tasks/phase-3-storefront/P3-T16-related-products.md) — stub
- ⬜ [P3-T17: Product JSON-LD (SEO)](tasks/phase-3-storefront/P3-T17-product-jsonld-seo.md) — stub
- ⬜ [P3-T18: Search page (FTS)](tasks/phase-3-storefront/P3-T18-search-page-fts.md) — stub
- ⬜ [P3-T19: Search — synonyms + trigram](tasks/phase-3-storefront/P3-T19-search-synonyms-and-trigram.md) — stub
- ⬜ [P3-T20: Cart drawer](tasks/phase-3-storefront/P3-T20-cart-drawer.md) — stub
- ⬜ [P3-T21: Cart store port from web-legacy](tasks/phase-3-storefront/P3-T21-cart-store-port.md) — stub
- ⬜ [P3-T22: Mobile pass](tasks/phase-3-storefront/P3-T22-mobile-pass.md) — stub
- ⬜ [P3-T23: Lighthouse pass](tasks/phase-3-storefront/P3-T23-lighthouse-pass.md) — stub

---

## Real-content gate (hard gate before Phase 4 polish)

- 🚧 [GATE: Real-content gate](blockers.md#real-content-gate) — see [blockers.md](blockers.md)

---

## Phase 4 — AI features + polish   (aggressive 2 days · realistic 3–5 days)

- ⬜ [P4-T00: Expand Phase 4 task files](tasks/phase-4-ai-and-polish/P4-T00-expand-phase-tasks.md) — depends P3-T23
- ⬜ [P4-T01: AI client + prompts scaffold](tasks/phase-4-ai-and-polish/P4-T01-ai-client-and-prompts-scaffold.md) — stub
- ⬜ [P4-T02: AI category suggest](tasks/phase-4-ai-and-polish/P4-T02-ai-category-suggest.md) — stub
- ⬜ [P4-T03: AI tag suggest](tasks/phase-4-ai-and-polish/P4-T03-ai-tag-suggest.md) — stub
- ⬜ [P4-T04: AI alt text](tasks/phase-4-ai-and-polish/P4-T04-ai-alt-text.md) — stub
- ⬜ [P4-T05: AI description draft](tasks/phase-4-ai-and-polish/P4-T05-ai-description-draft.md) — stub
- ⬜ [P4-T06: AI duplicate detect](tasks/phase-4-ai-and-polish/P4-T06-ai-duplicate-detect.md) — stub
- ⬜ [P4-T07: AI CSV cleanup helper](tasks/phase-4-ai-and-polish/P4-T07-ai-csv-cleanup-helper.md) — stub
- ⬜ [P4-T08: AI generations review UI](tasks/phase-4-ai-and-polish/P4-T08-ai-generations-review-ui.md) — stub
- ⬜ [P4-T09: Search synonym mining](tasks/phase-4-ai-and-polish/P4-T09-search-synonym-mining.md) — stub
- ⬜ [P4-T10: Real-content swap (gated)](tasks/phase-4-ai-and-polish/P4-T10-real-content-swap.md) — stub, requires real-content gate cleared
- ⬜ [P4-T11: Image rehost script](tasks/phase-4-ai-and-polish/P4-T11-image-rehost-script.md) — stub
- ⬜ [P4-T12: Blur placeholder backfill](tasks/phase-4-ai-and-polish/P4-T12-blur-placeholder-backfill.md) — stub

---

## Phase 5 — Launch readiness   (aggressive 1–2 days · realistic 2–3 days)

- ⬜ [P5-T00: Expand Phase 5 task files](tasks/phase-5-launch/P5-T00-expand-phase-tasks.md) — depends P4-T12
- ⬜ [P5-T01: Legal pages stubs](tasks/phase-5-launch/P5-T01-legal-pages-stubs.md) — stub
- ⬜ [P5-T02: Contact + About](tasks/phase-5-launch/P5-T02-contact-and-about.md) — stub
- ⬜ [P5-T03: Sitemap + robots](tasks/phase-5-launch/P5-T03-sitemap-and-robots.md) — stub
- ⬜ [P5-T04: OG images](tasks/phase-5-launch/P5-T04-og-images.md) — stub
- ⬜ [P5-T05: Analytics + Sentry](tasks/phase-5-launch/P5-T05-analytics-and-sentry.md) — stub
- ⬜ [P5-T06: Broken-image cron](tasks/phase-5-launch/P5-T06-broken-image-cron.md) — stub
- ⬜ [P5-T07: pg_dump backup GitHub Action](tasks/phase-5-launch/P5-T07-pg-dump-backup-action.md) — stub
- ⬜ [P5-T08: RLS attack test (deploy gate)](tasks/phase-5-launch/P5-T08-rls-attack-test.md) — stub
- ⬜ [P5-T09: Final QA checklist](tasks/phase-5-launch/P5-T09-final-qa-checklist.md) — stub
- ⬜ [P5-T10: Go live](tasks/phase-5-launch/P5-T10-go-live.md) — stub
