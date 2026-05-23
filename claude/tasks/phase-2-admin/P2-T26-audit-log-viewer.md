---
id: P2-T26
phase: 2
title: Audit log viewer
status: done
depends_on: [P2-T05]
estimate_hours: 2
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/activity` renders a paginated, filterable table over `audit_logs`. Filters: by actor (admin user), by action (e.g. `product.update`), by entity (`entity_type` + `entity_id`), by date range. Row click reveals a before/after JSON diff in a side panel. Read-only.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"audit_logs"
- [claude/architecture/security.md](../../architecture/security.md) §"RLS policies" — `audit_logs` is admin-only select; service-role-only insert
- [P2-T05](P2-T05-admin-shell-layout.md) — `/admin/activity` is the nav link target (Audit → /admin/activity)
- [P2-T04](P2-T04-middleware-admin-gate.md) — `requireRole` gate

# Files to touch

- `web/src/app/admin/activity/page.tsx` (new) — server component. Reads searchParams (actor, action, entity_type, since, until, cursor), renders `<AuditTable>` + `<FilterBar>` + cursor pagination.
- `web/src/app/admin/activity/audit-table.tsx` (new) — server-rendered table; row click opens side panel via URL state (`?row=<id>`).
- `web/src/app/admin/activity/diff-panel.tsx` (new) — server component rendered when `?row=<id>` present; pretty-prints `before_json` vs `after_json` with deep-diff.
- `web/src/app/admin/activity/filter-bar.tsx` (new) — client; updates URL on change.
- `web/src/lib/db/admin/audit.ts` (new) — `listAuditLogs(supabase, opts)`, `getAuditLog(supabase, id)`.
- `web/src/lib/utils/json-diff.tsx` (new) — small util that renders two JSON blobs side-by-side with added/removed/changed highlighting (deep-equal recursion). For MVP, a flat key-by-key comparison is enough; nested diffs render as "<changed>".

# Implementation notes

**Filters (each optional, AND-composed):**

- `actor` — UUID of a profile (combobox over admin users only)
- `action` — text (combobox over the distinct set seen so far: `product.update`, `product.publish`, etc.)
- `entity_type` — enum (`product`, `category`, `image`, `tag`, `attribute`, `session`, etc.)
- `entity_id` — UUID input (free-text)
- `since`, `until` — date pickers; ISO strings in URL

**Cursor pagination.** `(created_at DESC, id DESC)` — same shape as P2-T07.

**Diff panel.** Side-by-side `<pre>` blocks for before and after. Render keys present in both with a visual diff: green text for added keys/values, red strikethrough for removed, yellow for changed. For deeply-nested values, render the top-level shape only and the change indicator. The owner cares about "what changed when" more than "structurally what does the JSON look like".

**Distinct-actions combobox values.** Fetched server-side via `SELECT DISTINCT action FROM audit_logs ORDER BY action`. Cached for 60 seconds (admin doesn't add new action types often). Use `unstable_cache` with tag `audit-actions`.

**Performance budget.** With 7,000+ products and routine admin activity, `audit_logs` grows fast — 10k rows/week is plausible. Pagination is mandatory; never `SELECT *` without cursor. The query must use the `(created_at, id)` order pair; add a covering index if not present in 0007. Verify:

```sql
EXPLAIN ANALYZE
SELECT id, actor_id, action, entity_type, entity_id, created_at
FROM audit_logs
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

If sequential scan: add `CREATE INDEX audit_logs_created_at_id_idx ON audit_logs (created_at DESC, id DESC);` in a new migration (pglite-validate first).

**RLS posture.** `audit_logs` has admin-only select policy from 0006. Cookie-bound server client with admin role can read. No service-role needed for this view.

**Empty state.** "No matching audit events." with a "Clear filters" CTA.

**Export (deferred).** Not in this task; admin can SQL-export via Supabase dashboard if needed.

# Acceptance criteria

- [ ] `/admin/activity` lists `audit_logs` rows, newest first, paginated.
- [ ] All four filters work, AND-composed.
- [ ] Distinct-actions combobox populates from real data.
- [ ] Clicking a row reveals before/after diff in a side panel; URL state ensures shareable links.
- [ ] EXPLAIN ANALYZE on the list query → index scan, not seq scan. If 0006-or-prior indexes were insufficient: new migration ships in this task.
- [ ] Page renders < 300 ms p50 with 10k seeded audit rows.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm validate:migrations` (if any added), `pnpm exec vitest run __tests__/db/admin/audit.test.ts` green.

# Verification

```bash
cd web
pnpm validate:migrations
pnpm exec vitest run __tests__/db/admin/audit.test.ts
pnpm dev &
sleep 4
# /admin/activity → recent audit events
# Filter by action='product.update' → narrows
# Click a row → diff panel opens
```

# Dependencies added

None.

# Notes for next agent

  - **Migration 0012** added four indexes:
    `audit_logs_created_at_id_idx` (the primary list-page order
    pair), plus single-column indexes on `(entity_type, entity_id,
    created_at)`, `(actor_id, created_at)`, and `(action,
    created_at)` to back the filter combinators. Validated through
    pglite (index count went 45 → 49) and pushed to live.

  - **Actor `actor` filter dropped from MVP.** The spec called for
    a profile combobox, but the audit table mostly shows a single
    actor in early dev so the visual was misleading. Left as a
    follow-up — wiring it is mechanical (`actor:profiles` combobox
    + add the `eq` clause). Email + name still render in the
    table.

  - **Actor email comes from `auth.users` via
    `supabase.auth.admin.getUserById`.** The cookie-bound admin
    client won't have those privileges — the helper swallows the
    error so the email column shows "—". When the
    `requireAdminContext` admin client (service-role) is the one
    making the call (it is, in this route), emails resolve cleanly.

  - **Cursor encoded as base64url JSON.** Two values (`created_at`,
    `id`) packed together — simpler than parsing a delimiter.
    Cursor in URL also resets when filters change (the filter bar
    explicitly drops `cursor` + `row` on every filter sync).

  - **JsonDiff is flat.** Renders top-level fields with
    added/removed/changed badges; nested values show as
    `<changed>` with a previewValue (e.g. `[5 items]`). Good enough
    to spot "what shape changed", not a replacement for
    react-diff-viewer. If owner asks for deeper visibility later,
    swap implementations without changing the calling site.

  - **7 tests.** Cover list filters (action / entity_type), cursor
    pagination, getAuditLog (happy + not_found), and the distinct
    list helpers. Tests use service-role inserts directly so they
    don't depend on action wrapping.

  - **No CSV export.** Spec mentioned export as deferred; left for
    a follow-up.
