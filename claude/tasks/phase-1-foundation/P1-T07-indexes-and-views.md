---
id: P1-T07
phase: 1
title: Indexes + category_with_descendants view
status: done
depends_on: [P1-T06]
estimate_hours: 1
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the rest of the indexes (beyond FTS/trigram from P1-T05) are in place, and the recursive `category_with_descendants` view exists for category page queries.

# Prerequisites (read first)

- claude/architecture/database-schema.md (§"Indexes", §"Views")

# Files to touch

- `web/supabase/migrations/0007_indexes_views.sql` (new)

# Implementation notes

Index list (partial indexes filter on `deleted_at IS NULL` for query plan quality):

```sql
CREATE INDEX products_slug_idx               ON products (slug);
CREATE INDEX products_category_idx           ON products (category_id) WHERE deleted_at IS NULL;
CREATE INDEX products_published_at_idx       ON products (is_published, created_at DESC);
CREATE INDEX products_base_price_idx         ON products (base_price_inr)
  WHERE is_published = true AND deleted_at IS NULL;
CREATE INDEX products_stock_status_idx       ON products (stock_status);
CREATE INDEX product_images_sort_idx         ON product_images (product_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX product_variants_product_idx    ON product_variants (product_id) WHERE deleted_at IS NULL;
CREATE INDEX categories_parent_idx           ON categories (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX product_attributes_text_idx     ON product_attributes (attribute_id, value_text);
CREATE INDEX product_attributes_number_idx   ON product_attributes (attribute_id, value_number);
```

Recursive view:

```sql
CREATE OR REPLACE VIEW category_with_descendants AS
WITH RECURSIVE tree AS (
  SELECT id AS ancestor_id, id AS descendant_id
  FROM categories WHERE deleted_at IS NULL
  UNION ALL
  SELECT t.ancestor_id, c.id
  FROM tree t
  JOIN categories c ON c.parent_id = t.descendant_id
  WHERE c.deleted_at IS NULL
)
SELECT * FROM tree;
```

# Acceptance criteria

- [ ] All listed indexes exist (`\di` lists them).
- [ ] `category_with_descendants` view returns rows.
- [ ] Querying `WHERE category_id IN (SELECT descendant_id FROM category_with_descendants WHERE ancestor_id = $1)` uses an index scan, not seq scan (verify via `EXPLAIN`).

# Verification

```bash
cd web
pnpm dlx supabase db push
psql "$DB_URL" -c "EXPLAIN SELECT * FROM products WHERE category_id IN (SELECT descendant_id FROM category_with_descendants WHERE ancestor_id = (SELECT id FROM categories LIMIT 1));"
```

# Dependencies added

None.

# Notes for next agent

**2026-05-15 — DONE.** Applied to live Supabase by AI via `db push`.

`web/supabase/migrations/0007_indexes_views.sql` contains:
- 9 indexes:
  - `products_category_idx` partial (deleted_at IS NULL)
  - `products_published_at_idx` on (is_published, created_at DESC)
  - `products_base_price_idx` partial (is_published AND deleted_at IS NULL)
  - `products_stock_status_idx`
  - `product_images_sort_idx` partial (deleted_at IS NULL)
  - `product_variants_product_idx` partial (deleted_at IS NULL)
  - `categories_parent_idx` partial (deleted_at IS NULL)
  - `product_attributes_text_idx` on (attribute_id, value_text)
  - `product_attributes_number_idx` on (attribute_id, value_number)
- `public.category_with_descendants` recursive view excluding soft-deleted categories
- Smoke block: asserts every index exists; builds a 3-deep category tree; verifies descendants count (3/2/1 for root/mid/leaf); soft-deletes the middle node and verifies the tree breaks correctly (root → only itself; leaf becomes unreachable through root)

Total schema state after this migration (verified pglite):
```
enums=11 tables=20 indexes=43 functions=36
```

**Phase 1 schema migrations are complete.** Next phase-1 tasks are P1-T08 (seed script — Just Kraft → live Supabase), P1-T09 (typed data layer over the schema), P1-T10 (verify seed counts + integrate launch-blocker probe into CI), P1-T11 (regenerate architecture/database-schema.md from the live schema as the authoritative reflection).

**Skipped in this migration** but in the architecture doc — `products_slug_idx` and `products_sku_trgm_idx`/etc. Reason: slug already has a btree from UNIQUE; sku trigram already created in 0005_search.sql; FTS index already in 0005. Those declarations would duplicate. The 9 indexes here are net-new.
