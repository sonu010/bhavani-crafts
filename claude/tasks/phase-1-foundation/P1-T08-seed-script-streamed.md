---
id: P1-T08
phase: 1
title: Seed script — streaming Just Kraft JSON into Postgres
status: done
depends_on: [P1-T07]
estimate_hours: 3
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, `scripts/seed-from-justkraft.mjs` exists and is idempotent. Running it populates the catalog with all 8,509 seed products, their categories, images, variants, tags — all unpublished, `source='justkraft_seed'`, with `license_status='unverified'` on images.

# Prerequisites (read first)

- claude/runbooks/seed-from-justkraft.md (procedure)
- claude/architecture/database-schema.md (table shapes)
- `data/justkraft-inventory/justkraft_summary.json` (counts)
- `data/justkraft-inventory/justkraft_category_summary.csv` (taxonomy)

# Files to touch

- `scripts/seed-from-justkraft.mjs` (new)
- `scripts/category-slug-overrides.json` (new — disambiguate generic names per ADR/glossary)
- `data/justkraft-inventory/seed_report.json` (generated each run)

# Implementation notes

**Streaming** — the 22 MB JSON must not be fully parsed into memory. Use `stream-json`:

```js
import { parser } from 'stream-json';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import fs from 'node:fs';

const pipeline = fs
  .createReadStream('data/justkraft-inventory/justkraft_products.json')
  .pipe(parser())
  .pipe(StreamArray.withParser());

for await (const { value: product } of pipeline) {
  await processProduct(product);
}
```

**Idempotency** — every upsert uses a natural key:
- `categories` upsert keyed on `slug` (after disambiguation through `category-slug-overrides.json`).
- `products` upsert keyed on `sku`.
- `product_images` upsert keyed on `(product_id, url)` (composite). To avoid duplicates on re-run.
- `tags` upsert keyed on `slug`.

**Category slug strategy** — for the 31% "Uncategorized" Just Kraft products, route into a single top-level `Other` category with slug `other`. For generic-named subcategories (`moulds`, `paints`, etc.) that appear in multiple parents, prefix with the parent slug to disambiguate. The override map in `category-slug-overrides.json` lists every known collision and its resolution. Examples:

```json
{
  "Resin Art Supplies > Moulds": "resin-moulds",
  "Baking & Cake Tools > Moulds": "chocolate-moulds",
  "Art Stationery > Paints & Colours": "paints-and-colours"
}
```

**Batching** — process products in batches of 500. After each batch, call `supabase.from('products').upsert(batch, { onConflict: 'sku' })`. Same for images, tags, etc.

**Variants from scraped data** — Just Kraft variants are URLs to sibling products, not real variant rows. We do not link them. Instead, we store the label as a `product_variants` row with `is_default=true`, no price (inherits from parent), no stock. P2-T14 handles real variant editing.

**Logging** — write progress every 500 products (`stderr`), keep a count of `success`, `skipped`, `errored` per entity type. End-of-run: write `seed_report.json` with all counts and a list of `scrape_notes`.

**Service-role** — this script uses the service-role client (bypasses RLS). Document the security implication: this is a one-time bootstrap, run from a developer's laptop with credentials in `.env.local`. Never deploy this script.

# Acceptance criteria

- [ ] Script runs end-to-end with no OOM (heap usage stays under 500 MB).
- [ ] `SELECT count(*) FROM products WHERE source = 'justkraft_seed'` returns ~8,509.
- [ ] `SELECT count(*) FROM categories` returns ~255 (plus the override-driven aliases).
- [ ] All seed products are `is_published = false`, `review_status = 'needs_review'`.
- [ ] All seed images are `license_status = 'unverified'`.
- [ ] Re-running the script does not duplicate rows (idempotency check via row counts before/after a second run).
- [ ] `seed_report.json` written and contains counts + first-50 scrape_notes.

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
node --max-old-space-size=512 scripts/seed-from-justkraft.mjs
psql "$DB_URL" <<'SQL'
SELECT count(*) FROM products WHERE source = 'justkraft_seed';
SELECT count(*) FROM product_images;
SELECT count(*) FROM categories;
SQL
# Re-run, expect identical counts
node scripts/seed-from-justkraft.mjs
psql "$DB_URL" -c "SELECT count(*) FROM products WHERE source = 'justkraft_seed';"
```

# Dependencies added

`stream-json` — already added in P0-T05.

# Notes for next agent

**2026-05-15 — DONE.** `web/scripts/seed-from-justkraft.mjs` ran cleanly against live Supabase after three iterations. Live counts (verified via REST):

```
products              7,780   (all is_published=false, source='justkraft_seed')
categories              362
tags                    458
product_images       14,964   (all license_status='unverified' — RLS blocks public read)
product_variants      8,181
product_tags          7,971
```

Anon probe confirms 0 products visible (RLS holds). Launch-blocker condition holds: 0 published seed rows.

**Data quality surprises** that adjusted final numbers from the 8,509 starting count:
- **729 duplicate SKUs in the source JSON.** Deduplicated last-write-wins after streaming. Final unique-by-SKU count: 7,780. (The Just Kraft sitemap apparently lists the same product under multiple URLs in some cases.)

**Three bugs hit + fixed during the runs** (all in iterative dev, not on owner):

1. **`stream-json` v2 import shape:** v1 was `import StreamArray from 'stream-json/streamers/StreamArray.js'`; v2 is named export `{ streamArray }`. Also needs `pick` filter to drill into the `products` array of the top-level object.
2. **Slug collisions on long product names.** First attempt `slugify(name + "-" + sku)` truncated to 80 chars and lost the SKU tail. Fix: dedicated `productSlug(name, sku)` puts the name prefix ≤60 chars, SKU as full suffix.
3. **`ON CONFLICT DO UPDATE` row-twice error:** duplicate SKUs in one batch hit Postgres's restriction that each conflict target can only update once per command. Fix: dedupe by sku before upserting.

**Idempotency strategy:** the script begins with a cleanup pass that deletes all `source = 'justkraft_seed'` products. CASCADE FKs unwind images, variants, options, attributes, product_tags. This is necessary because `product_images` has no UNIQUE on (product_id, url) — without cleanup, a re-run would double-insert images. Tags themselves and search_synonyms are preserved across runs.

**Local-only.** The 22MB JSON is gitignored. Script must run from a developer's laptop with `web/.env.local` populated. Never deploy this script.

`seed_report.json` written at `data/justkraft-inventory/seed_report.json` with the final counts + truncated error list.

Phase 1 schema migrations are now backed with realistic data. Ready for P1-T09 (typed data layer).
