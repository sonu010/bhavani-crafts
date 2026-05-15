# ADR-002 — Admin-first phase order

**Status:** Accepted · **Date:** 2026-05-15

## Context

A typical e-commerce build does storefront first (the visible thing), then admin (the back office). v1 of our plan followed that order. The reviewer flagged: the storefront depends on clean product data; if the admin can't manage data, the storefront looks pretty but is useless.

## Decision

Build the **admin panel before the storefront** (Phase 2 before Phase 3).

## Consequences

**Positive:**
- We start with the highest-stakes UX: the non-technical owner managing 8.5k+ products.
- The storefront builds against real-feeling data (via seed + admin edits), not lorem ipsum.
- Bulk import, soft-delete, audit log, jobs — all exercise the data model before the storefront cements its assumptions.
- Mismatches between schema and product reality surface early.

**Negative:**
- No public storefront exists for the first ~2 weeks of execution; non-developers may feel progress is invisible.
- We mitigate this with Vercel preview deploys of the admin and weekly screenshot updates.

## Revisit trigger

If admin work blocks for > 5 days waiting on owner content/decisions, switch context to Phase 3 storefront work that doesn't depend on real content, then resume admin when unblocked.
