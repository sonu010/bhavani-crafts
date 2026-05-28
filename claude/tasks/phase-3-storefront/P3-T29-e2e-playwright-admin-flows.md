---
id: P3-T29
phase: 3
title: E2E (Playwright) — admin critical flows
status: in_progress
depends_on: [P2-T29]
estimate_hours: 4
owner: ai
last_updated: 2026-05-18
---

# Goal

Browser automation that drives the real admin UI and verifies the
wiring the data-layer vitest suites can't reach: that buttons call
their actions, forms submit the right shape, dialogs confirm, and
results render. Runs against a disposable LOCAL Supabase stack, never
production. (`testing-and-ci.md` always named Playwright; the Phase 3
expansion left it without an owning task — this is it.)

# Prerequisites (read first)

- claude/architecture/testing-and-ci.md §"Playwright E2E"
- `web/__tests__/auth/mfa-enroll.test.ts` — the proven TOTP
  enroll/challenge/verify flow the auth fixture mirrors
- `web/playwright.config.ts` + `web/e2e/README.md` (the setup)

# Files to touch

- `web/playwright.config.ts` (done) — projects: `setup` → `admin`
  (storageState) + `anon`; local-stack env load; auto-boots `pnpm dev`.
- `web/e2e/constants.ts` (done) — test-admin creds + artifact paths.
- `web/e2e/seed-admin.ts` (done) — `pnpm e2e:seed`; creates the TOTP
  admin (role=owner) on the LOCAL stack; refuses non-local URLs.
- `web/e2e/auth.setup.ts` (done) — logs in via the real UI
  (password + TOTP from the seeded secret), saves storageState.
- `web/e2e/anon/auth-guard.spec.ts` (done) — anon→/login redirect +
  public homepage reachable.
- `web/e2e/admin/products.spec.ts` (done) — list renders + product
  name edit persists.
- `web/e2e/admin/{bulk,trash}.spec.ts` (TODO) — bulk publish, soft-
  delete → Trash → restore.
- `web/.github/workflows/ci.yml` (TODO) — a separate `e2e` job that
  boots the local stack + seeds + installs chromium + runs.

# Implementation notes

- **Local Supabase only.** E2E mutates catalog data through the UI;
  the seed hard-refuses any non-127.0.0.1 URL. `supabase db reset`
  gives each run a clean slate. See `e2e/README.md` for bring-up.
- **TOTP login is automated** via `otplib` + the secret the seed
  writes to `e2e/.auth/totp-secret.txt`. The `setup` project performs
  the real /login → /auth/verify-2fa flow once and saves the cookie
  state; `admin` specs reuse it (`storageState`).
- **Serial, single worker.** Shared catalog state → no parallelism, so
  assertions stay deterministic.
- **Idempotent specs.** The product-edit spec appends an `[e2e …]`
  marker then reverts, so re-runs don't accumulate drift.
- **vitest stays separate** — `vitest.config.ts` now scopes `include`
  to `__tests__/**` and excludes `e2e/**`, so the default `*.spec.*`
  glob doesn't try to run the Playwright specs.

# Acceptance criteria

- [ ] `pnpm exec playwright test --list` discovers all specs (done —
      6 tests across 3 files).
- [ ] tsc + lint green with the e2e/ tree (done).
- [ ] `pnpm e2e:seed` creates the TOTP admin on a local stack
      (verify on a Docker machine).
- [ ] `pnpm test:e2e` green: auth guard, login+TOTP, product edit
      (verify on a Docker machine).
- [ ] bulk + trash specs added + green.
- [ ] CI `e2e` job added (boots local stack, seeds, runs) — does not
      gate `static`/`live`.

# Verification

```bash
cd web
pnpm exec playwright test --list      # compiles + discovers (no Docker)
# Full run (needs Docker):
pnpm dlx supabase start && pnpm dlx supabase db reset
cp e2e/.env.e2e.example e2e/.env.e2e   # paste local keys (supabase status)
pnpm e2e:seed
pnpm exec playwright install chromium
pnpm test:e2e
```

# Dependencies added

- `@playwright/test` (dev) — browser E2E. Browser binaries via
  `playwright install chromium` (not committed).

# Notes for next agent

  - **Harness built + structurally validated in this session; the
    first GREEN browser run is pending** — it was authored in an
    environment without a running Docker daemon, so `supabase start`
    (and thus the live run) couldn't execute here. `--list` + tsc +
    lint all pass, so the config + specs compile + are discovered.
    First run on a Docker-capable machine per `e2e/README.md`.
  - **Selectors are best-effort by role/label** and may need a tweak
    on first run (e.g. the verify-2fa input label, the save-button
    name). Adjust to match the rendered DOM; prefer `getByRole` /
    `getByLabel` over CSS where possible.
  - **Product-edit spec needs a seeded product** on the local stack
    (`supabase db reset` applies migrations but not the justkraft
    seed). Seed a couple via the importer or a small SQL insert, or
    add an `e2e:seed-products` step.
  - **Remaining specs (bulk, trash) + the CI job** are the TODO to
    flip this task to done.
