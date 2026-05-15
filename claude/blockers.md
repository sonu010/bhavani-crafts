# Blockers

Last updated: 2026-05-15

Things we are waiting on from the owner (or external systems) before specific tasks can complete. AI does not silently skip blocked tasks — it pauses, opens a blocker entry here, and moves to the next unblocked task.

## Active blockers

### Credential blockers (Phase 0)

These pause specific Phase 0 tasks. The rest of Phase 0 can proceed in parallel.

- **Supabase project credentials** — needed mid-P0-T08. Owner provides `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (latter is server-only, never committed).
- **GitHub repo** `bhavani-crafts` — needed mid-P0-T10. Owner creates the repo OR explicitly authorizes `gh repo create bhavani-crafts --private --source .` to run.
- **Vercel project link** — needed mid-P0-T10. Owner clicks "Import Project" in Vercel dashboard against the GitHub repo.

### Real-content gate (Phase 4)

**This is a hard gate.** Phase 4 polish work (P4-T10 and downstream visual polish) does not begin until every item below is delivered. Non-content-dependent Phase 4 work (AI client scaffolding, category/tag suggest, alt-text generator, image rehost script) continues in parallel.

| # | Asset | Who | Status |
|---|---|---|---|
| 1 | 20+ real Bhavani products entered into admin (or CSV provided for import) | Owner | ⬜ pending |
| 2 | 8 category cover photos (one per top-level category), ≥ 1600px, owner-shot or owner-licensed | Owner | ⬜ pending |
| 3 | Real store address (with PIN code) | Owner | ⬜ pending |
| 4 | Real opening hours (7-day schedule) | Owner | ⬜ pending |
| 5 | Real WhatsApp Business number | Owner | ⬜ pending |
| 6 | Logo / wordmark decision (SVG, or sign-off to use the Newsreader wordmark as temporary mark) | Owner | ⬜ pending |

### Optional / nice-to-have

- **Anthropic API key** — only needed when we start Phase 4 AI features. Until then, AI features are gated behind a no-op stub.
- **Resend account** — only needed when admin invite emails are enabled (Phase 2 stretch). Email/password admin login does not require it.
- **Custom domain** — only needed at P5-T10 (Go live). Vercel preview URL works for everything before.

## Resolved blockers

- **Vercel Root Directory + env vars** (resolved 2026-05-15) — owner configured Root Directory → `web`, added 3 Supabase env vars, redeployed. Preview at `https://bhavani-crafts-<hash>-sonu010s-projects.vercel.app/` returns 200 on `/`, `{"ok":true}` on `/api/health`, all 6 security headers present, `/design` returns HTTP 404. Deployment protection disabled on preview to allow AI curls.

## Follow-ups (not blocking, but tracked)

- **`/design` RSC payload leak** (logged 2026-05-15) — `/design` returns HTTP 404 with the Next default not-found UI, but the RSC payload in the response body still contains the dev gallery's serialized tree (palette swatches, type examples). Layout-level `notFound()` doesn't prevent child page from streaming into the response. The user-facing behavior is correct (404 status, 404 UI), and the leaked content is non-sensitive (just our palette + fonts), so this isn't security-critical. Will be fixed in P2-T04 (middleware admin gate) — the same middleware will 404 any `/design*` path in production before any rendering happens. Until then, the gating relies on `process.env.NODE_ENV === "production"` in `web/src/app/(dev)/layout.tsx`.
