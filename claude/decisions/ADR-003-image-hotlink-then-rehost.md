# ADR-003 — Hotlink scraped images during dev, rehost before launch

**Status:** Accepted · **Date:** 2026-05-15

## Context

The Just Kraft seed has 8,509 products with 1–4 Cloudinary URLs each (~20k+ images). We need them visible during development to test the UI at realistic volume. Two options:

- **A:** Rehost all 20k+ images to Supabase Storage up front before any UI work.
- **B:** Hotlink the existing CDN URLs during dev (free, instant), rehost only those the owner chooses to keep.

## Decision

**B — hotlink during dev, rehost before launch.**

## Consequences

**Positive:**
- We can render the catalog in the admin within hours of seeding, not days.
- Bandwidth cost is zero — Just Kraft's CDN serves the files.
- We avoid rehosting images we'll never publish (the owner will keep maybe 5% of seed products at most).

**Negative:**
- Seed images are someone else's content; we cannot serve them publicly. The RLS policy on `product_images` requires `license_status IN ('owned','licensed','public_domain')`. Seed rows are `unverified`, so anon clients never see them.
- If Just Kraft rotates URLs, the admin's preview thumbnails break. Acceptable — admin sees a broken image, knows to upload a real one.
- We must run a rehost script (P4-T11) before launching any owner-kept seed product. The script downloads, processes via sharp, uploads to our Storage, updates `url` + `storage_path` + `source`.

## Safeguards

- `is_published = false` is the default for all seeded products.
- `source = 'justkraft_seed'` makes leaked-seed-rows trivially queryable for removal.
- Launch-blocker SQL in `runbooks/launch-blockers.sql` blocks any deploy where a published image still points at the Just Kraft CDN.

## Revisit trigger

If we ever publicize any URL pointing at someone else's CDN, this ADR has failed and we revisit the rehost strategy.
