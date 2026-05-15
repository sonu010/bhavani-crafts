# ADR-007 — AI is assistive, never autonomous

**Status:** Accepted · **Date:** 2026-05-15

## Context

We integrate Claude for category suggestion, tag generation, alt-text, description drafting, duplicate detection, CSV cleanup, and search synonym mining (Phase 4). The temptation to auto-apply AI output is real (faster admin UX). The risks are also real: hallucinated categories, malformed tags, alt text that's just the product name, and prompt-injection attacks via scraped or admin-typed content.

## Decision

**No AI output is ever auto-applied to the catalog.** Every suggestion lands in `ai_generations` with `status='proposed'` and waits for an explicit admin click to accept.

## Consequences

**Positive:**
- Hallucinations and injection attacks are caught by a human before reaching the storefront.
- Audit trail (`ai_generations`) shows what was suggested and what the admin accepted/rejected.
- Prompts are versioned; we can A/B test and replay.
- The "Suggest" buttons in the admin UI feel like an assistant, not a black box.

**Negative:**
- Admin must click "Accept" for every suggestion. Mitigated by:
  - Batched accept ("Accept all 18 suggestions in this CSV import") with the same review UI.
  - Pre-filled form fields with diff highlighting so accepting is one click per field.

## Process

1. AI call → output → Zod schema → semantic checks → `ai_generations` row with `status='proposed'`.
2. Admin UI shows the suggestion next to the field with an "Accept" or "Reject" action.
3. Accept: the field is filled, `ai_generations.status='accepted'`, `reviewed_by` and `reviewed_at` are set.
4. Reject: `status='rejected'`. We learn from rejections (prompt iteration).

## Revisit trigger

After Phase 4 ships and the admin has been live for 30+ days, review per-task acceptance rates. Tasks with > 90% acceptance over 100+ samples may move to "auto-fill, admin reviews" (still not silent — admin sees the pre-filled field).
