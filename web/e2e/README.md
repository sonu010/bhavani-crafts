# E2E (Playwright) — admin critical flows

Browser automation that drives the real admin UI (login → TOTP 2FA →
`/admin` → product edit) and verifies the wiring the data-layer vitest
suites can't: that buttons call their actions and results render.

**Runs against a LOCAL Supabase stack — never production.** E2E mutates
catalog data through the UI; pointing it at the real project would
pollute it. Multiple guards enforce this:

- `seed-admin.ts` refuses to run unless the Supabase URL is local.
- Playwright's `webServer` builds the app with the local stack's env.
- The seeded admin (`e2e-admin@bhavani.test`) exists ONLY on the local
  stack, so even a misconfigured run can't authenticate against prod.

## One-time setup

Docker must be running. Then, from `web/`:

```bash
# Boots the local stack, applies all migrations + seed.sql, and writes
# web/.env.test + web/e2e/.env.e2e from the running stack (no manual
# key-pasting). Idempotent — safe to re-run.
pnpm test:e2e:setup        # = test:setup + e2e:seed

# Install the browser (one-time, ~100MB)
pnpm exec playwright install chromium
```

`pnpm test:e2e:setup` expands to:

```bash
supabase start && supabase db reset && node scripts/write-test-env.mjs   # test:setup
pnpm e2e:seed                                                            # TOTP admin
```

The local stack has TOTP MFA enabled (`config.toml [auth.mfa.totp]`) to
mirror production, so the seed can enroll + verify a factor and the login
E2E can step the session up to AAL2.

The seed (`supabase/seed.sql`) gives every reset a deterministic catalog:
4 categories, 5 published products (the storefront sees these), and 3
`needs_review` products (the admin products list defaults to this filter,
so these are what the edit spec operates on).

## Run

```bash
pnpm test:e2e                  # headless; builds + starts the app, runs all specs
pnpm test:e2e --ui            # Playwright UI mode (watch + time-travel)
pnpm test:e2e --project=anon  # just the anonymous guard specs
```

The `webServer` runs `pnpm build && pnpm start` (a PRODUCTION build), not
`next dev`. Reason: dev recompiles each route on first hit and the
login→2FA redirect chain plus the proxy's auth calls regularly blew past
the test timeout. A prebuilt server resolves redirects in ms and mirrors
what real users hit.

## Refreshing after a code/schema change

```bash
pnpm db:reset:test    # reapply migrations + seed.sql, rewrite env files
pnpm e2e:seed         # the reset wiped the auth user — recreate the admin
pnpm test:e2e
```

## Layout

```
e2e/
  constants.ts        test-admin creds + file paths
  seed-admin.ts       ensures the TOTP admin (pnpm e2e:seed)
  auth.setup.ts       logs in via UI (password + TOTP), saves storageState
  anon/*.spec.ts      unauthenticated flows (auth guard, public pages)
  admin/*.spec.ts     authed flows (reuse the stored AAL2 session)
  .auth/              gitignored — storageState + TOTP secret
  .env.e2e            gitignored — local stack keys (auto-generated)
```

## Why local, not the cloud project

Both the vitest data-layer suites AND the E2E suite now target the local
stack — neither touches production. `vitest.setup.ts` hard-refuses any
non-local Supabase URL (override only via `ALLOW_NONLOCAL_TEST_DB=1`), and
E2E drives full UI flows that can leave junk on a failed run, so it gets a
disposable database. `supabase db reset` gives every run a clean slate.

## CI

A separate `e2e` job (see `.github/workflows/ci.yml`) boots the local
stack in the runner, seeds, installs chromium, and runs the suite. The
`integration` job runs vitest + launch-blockers against its own local
stack. Neither needs secrets; neither writes to production.

## Admin-spec conventions (learned the hard way)

These are the patterns the 8 admin lifecycle specs use. Reach for them
when you add a new spec.

- **Helpers live in `e2e/admin/_helpers.ts`** — `createDraftProduct`,
  `saveGeneralTab`, `autoAcceptConfirms`, `uniq`, `zzzSlug`, `zzzSku`.
  Don't reinvent these per file.
- **Fixtures are `zzz-e2e-…` prefixed** so they sort last in any UI and
  the vitest-side `purgeZzzFixtures` sweeps them across runs.
- **Identify rows by unique slug or SKU**, not by name. Use the
  `?q=<unique>` filter on products / `filter({ hasText: slug })` on
  trees / lists. Stops you from selecting yesterday's leftover row.
- **`<table>` is desktop-only on many admin pages** (mobile uses a
  separate `<ul>` card view). The same row text appears twice in DOM.
  Scope your assertions: `page.locator("table").getByText(...)`. Tags
  page is the exception — it's `<ul>` all the way down.
- **Soft-delete + bulk-delete need a typed "delete" string** in the
  dialog. Hard-delete needs "DELETE" (uppercase). Forms with
  `window.confirm()` (Unpublish · Soft-delete category · Soft-delete tag
  · Run import) auto-accepted via `autoAcceptConfirms(page)` at the top
  of the test — register BEFORE the click that opens the dialog.
- **Selection state is URL-synced** on `/admin/products` — the per-row
  checkboxes fire `router.replace`. Two `.click()`s in a row race each
  other and lose one. With a `?q=` filter, click the "Select all visible
  rows" header checkbox to multi-select atomically. (Same reason
  `.check()` is unreliable on these — use `.click()`.)
- **Toasts are unreliable as success signals**. Sonner toasts auto-
  dismiss in ~5s and many flows trigger `router.refresh()` or
  `window.location.reload()` immediately after, eating the toast before
  you can assert on it. Prefer state-based signals: input cleared after
  successful create, row visible/absent after delete, URL changed after
  redirect. Tags' merge for example calls `window.location.reload()`
  the moment `r.ok` is true.
- **Form labels mostly don't have `htmlFor`** — the project's `<Field>`
  wrapper renders label + input as siblings. `getByLabel(...)` misses
  them. Use `input[name="..."]` instead — react-hook-form sets the
  `name=` attribute via `register("...")`.
- **`waitForLoadState("networkidle")` is flaky** with HTTP keep-alive
  on the prod-build server — the network never reaches "idle". Use
  `expect(...).toHaveCount(N, { timeout })` or
  `expect(page).toHaveURL(...)` — both poll without depending on
  network silence.
- **`selectOption({ label })` only accepts a STRING**, not a RegExp.
  Resolve the exact label by `option.textContent()` first if you need
  fuzzy match.
- **Trash entity types are PLURAL**: `?entity=products` /
  `?entity=categories` / `?entity=tags`. Default is `products` (which
  the product-lifecycle spec uses).
- **`admin-chrome` project is opt-in** via `E2E_CHROME=1` (the
  `test:e2e:chrome` script sets it). Without that, the default
  `pnpm test:e2e` runs each admin spec only once.

## Gotchas worth knowing

- **Soft navigations don't fire `load`.** Server-Action `redirect()` and
  `<Link>` clicks are client-side navigations with no `load` event. Use
  `expect(page).toHaveURL(...)` / element assertions, NOT
  `page.waitForURL(..., { waitUntil: "load" })`, which hangs.
- **`/saved/i` matches "Unsaved changes".** Assert on the specific success
  toast ("Product saved"), or a test will proceed before the save commits.
- **`allowedDevOrigins`** is set for `127.0.0.1` in `next.config.ts` so
  manual `pnpm dev` testing at 127.0.0.1 isn't blocked by Next 16's
  cross-origin Server Action guard. (The E2E prod build doesn't need it.)
- **`unstable_cache` persists across builds in `.next/cache`.** It's keyed
  only on its keyParts, not the Supabase target. If you build the
  storefront against one DB (e.g. live `.env.local`) and then rebuild
  against the local stack WITHOUT `rm -rf .next`, the static homepage
  serves stale data from the other DB. `rm -rf .next` when switching the
  build's DB target. CI is immune (fresh checkout each run).
- **The local stack can degrade** (containers exit under memory pressure).
  Symptom: the app gets `fetch failed` but `supabase db` queries work
  (DB up, Kong/REST down). Fix: `supabase stop && supabase start`
  (preserves the data volume — the seed survives).
