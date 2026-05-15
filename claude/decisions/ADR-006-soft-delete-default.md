# ADR-006 — Soft delete as the default for catalog data

**Status:** Accepted · **Date:** 2026-05-15

## Context

Bulk delete by a non-technical admin is a recovery risk. A single mis-click could remove 8,509 rows. Hard delete is also a problem because `audit_logs.entity_id` references rows that no longer exist.

## Decision

- Every catalog table (`products`, `categories`, `tags`, `product_images`, `product_variants`) gets `deleted_at timestamptz` and `deleted_by uuid` columns from day one.
- All "delete" UI actions soft-delete by default: set `deleted_at = now()`, `deleted_by = auth.uid()`.
- A "Trash" view in admin lists rows where `deleted_at IS NOT NULL`, allows restore.
- Hard delete is reserved for `/admin/trash` with typed-confirmation ("Type DELETE to confirm").
- Bulk delete is **always soft**, no exceptions.

## Consequences

**Positive:**
- Owner-mistake recovery: restore within seconds, no DB intervention.
- Audit trail integrity preserved.
- RLS public-select policies already filter `WHERE deleted_at IS NULL`; storefront never sees soft-deleted rows.

**Negative:**
- All catalog queries must include `WHERE deleted_at IS NULL`. Easy to forget. Partial indexes (`... WHERE deleted_at IS NULL`) make it cheap and keep query plans correct.
- Storage continues to hold image files for soft-deleted products. Acceptable; a separate `garbage_collect_storage` job (deferred to Phase 5+) reclaims them after a 30-day grace.

## Trash retention

- Soft-deleted rows are retained for **30 days** by default.
- A nightly cron (Phase 5) hard-deletes rows where `deleted_at < now() - interval '30 days'`.
- Owner can pin a row in trash indefinitely by setting a flag (Phase 5 stretch).

## Revisit trigger

If the trash table becomes large enough to affect query planning (millions of rows), partition by `deleted_at` month or migrate hard-deletion runbook.
