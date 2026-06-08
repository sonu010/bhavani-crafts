---
id: P4-T10
phase: 5
title: Real-content swap (de-AI'd, rehomed from Phase 4)
status: not_started
depends_on: [P5-T00]
estimate_hours: 4
owner: shared
last_updated: 2026-06-07
---

# Goal

Replace the JustKraft-scraped seed corpus (5,802 products of varying
provenance + hot-linked cloudfront images) with the owner-curated
catalog ready for launch. After this task:

- Every published product on the storefront has been chosen by the
  owner (not pulled from the scrape).
- Every product's `review_status='published'` is intentional, not a
  side-effect of the `flip-publish-all.mjs` preview script.
- Featured / Atlas / Weekly Collection are picked from the curated
  set, not random.

Rehomed from Phase 4 because the work is NOT AI-dependent — owner
curates manually using the existing admin tools (`/admin/products`,
`/admin/products/new`, CSV import).

# Prerequisites (read first)

- `web/scripts/flip-publish-all.mjs` — the temporary script that
  flipped all 5,802 seed products to `is_published=true` for the
  preview. Revert before this task starts: `node scripts/flip-publish-all.mjs --revert`.
- `web/scripts/flip-image-license.mjs` — same: revert before
  starting.
- `claude/decisions/ADR-006-soft-delete-default.md` — owner soft-
  deletes the unwanted scraped products, doesn't hard-delete (audit
  trail).
- `claude/architecture/overview.md` §"Real-content gate (hard gate)"
  — this is the gate.

# Files to touch

No code changes expected — this task is data work via the admin UI
+ optionally the CSV import.

- Optionally: `web/supabase/seed.sql` (modified) — if owner wants a
  permanent "this is the curated seed" record. Otherwise the live
  DB IS the source of truth and seed.sql stays as the JustKraft
  reference dump.

# Implementation notes

- **Revert the preview flips first:**
  ```bash
  cd web
  node scripts/flip-publish-all.mjs --revert
  node scripts/flip-image-license.mjs --revert
  ```
  After these run, every JustKraft product is back to is_published=
  false / license_status='unverified'. Storefront empties out.
- **Curation flow:**
  1. Owner opens /admin/products (the New product button now exists
     per the recent fix). Filter to "Needs review."
  2. For each product the owner wants to launch with:
     - Open editor.
     - Confirm name, SKU, slug, price, short_description, full
       description, category, tags, attributes.
     - Verify images: each should be `license_status='owned'` (or
       hard-delete the JustKraft URLs and upload owner photos via
       /admin/products/[id]/edit?tab=images).
     - Add variants if applicable.
     - Hit Publish.
  3. For the 5,000+ unwanted scraped products: bulk-soft-delete
     them from the products list. They sit in Trash (30-day
     retention per ADR-006) in case anything got nuked by accident.
- **Curated minimum** for launch: ≥ 24 products spread across ≥ 6
  categories. Below that the Atlas grid and Weekly Collection
  surfaces look bare.
- **Featured products:** `is_featured=true` drives the Weekly
  Collection. Pick 6-8 the owner is proud of.
- **Hard gate:** before P5-T10 go-live, this task must be done.
  Random JustKraft products + cloudfront-hot-linked images would
  ship the storefront in a state the owner can't stand behind.

# Acceptance criteria

- [ ] `flip-publish-all` + `flip-image-license` reverted.
- [ ] ≥ 24 owner-curated products with `is_published=true`.
- [ ] ≥ 6 categories have at least 3 published products each.
- [ ] 6-8 products flagged `is_featured=true`.
- [ ] No `license_status='unverified'` rows among published-product
      images.
- [ ] No product carries `source='justkraft_seed'` AND
      `is_published=true` (unless the owner deliberately kept a
      scraped product after personally curating it).

# Verification

```sql
-- Run via /admin or psql against live
select count(*) from products where is_published=true and deleted_at is null;
select count(distinct category_id) from products where is_published=true;
select count(*) from products where is_featured=true and is_published=true;
select count(*) from product_images img
  join products p on p.id = img.product_id
  where p.is_published = true
    and img.license_status not in ('owned','licensed','public_domain')
    and img.deleted_at is null;
-- expect last query: 0
```

# Notes for next agent

(empty)
