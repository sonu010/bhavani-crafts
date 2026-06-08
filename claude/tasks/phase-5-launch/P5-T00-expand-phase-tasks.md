---
id: P5-T00
phase: 5
title: Expand Phase 5 task files
status: done
depends_on: [P3-T29]
estimate_hours: 1
owner: ai
last_updated: 2026-06-07
---

# Goal

After this task, every Phase 5 task file has a fleshed body (Goal /
Prerequisites / Files / Implementation notes / Acceptance / Verification),
the same shape Phase 1–3 tasks follow. The launch checklist is now
executable — no more "Body to be written when we get there."

# Context

Phase 5 is the launch-readiness phase. Most of the heavy build work is
done by the close of Phase 3 + the P3.5 polish bundle. Phase 5 turns
the running preview into a thing real customers can use:

- 4 visible content gaps: legal pages (T01), contact/about (T02), OG
  share cards (T04), sitemap-on-GSC (T03).
- 3 operational hardening items: analytics + Sentry (T05),
  broken-image cron (T06), backup/restore drill (T07).
- 1 security gate: anon RLS attack-test probe against live (T08).
- 2 launch ceremonies: final QA checklist (T09), DNS cutover (T10).
- 3 rehomed from Phase 4 (AI deferred, polish kept): real-content
  swap (P4-T10), image rehost (P4-T11), blur-placeholder backfill
  (P4-T12). See [plans.md](../../plans.md) §"Phase 5 — Carried over."

The dependency that pointed at P4-T12 (now deferred) is rewired to
P3-T29 (E2E harness green, the last Phase 3 deliverable).

# Notes for next agent

Order recommended in the response that created these specs:
1. P5-T01 legal pages (footer links are 404 today)
2. P5-T08 RLS attack test (security gate before any real customer hits live)
3. P5-T07 pg_dump verify + restore drill
4. P4-T10 + P4-T11 real-content swap + image rehost (urgent: JustKraft
   cloudfront images are temporary)
5. P5-T05 analytics + Sentry
6. P5-T03 sitemap-on-GSC verify
7. P5-T06 broken-image cron
8. P5-T04 OG images
9. P5-T02 contact + about
10. P4-T12 blur backfill (small polish)
11. P5-T09 final QA checklist
12. P5-T10 go live
