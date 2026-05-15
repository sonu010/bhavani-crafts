---
id: P1-T05
phase: 1
title: Migration — search (synonyms, search_logs, FTS column + indexes)
status: not_started
depends_on: [P1-T01]
estimate_hours: 1
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, full-text search infrastructure is in place: a generated `fts tsvector` column on `products`, GIN indexes for FTS and trigram, the `search_synonyms` and `search_logs` tables, and a small seeded synonym list.

# Prerequisites (read first)

- claude/architecture/search.md (full file)
- claude/decisions/ADR-004-postgres-fts-no-meilisearch.md

# Files to touch

- `web/supabase/migrations/0005_search.sql` (new)
- `web/src/lib/db/types.gen.ts` (regenerated)

# Implementation notes

Generated FTS column:

```sql
ALTER TABLE products ADD COLUMN fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(short_description, '') || ' ' ||
    coalesce(description, '')
  )
) STORED;

CREATE INDEX products_fts_idx ON products USING GIN (fts);
CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_sku_trgm_idx  ON products USING GIN (sku gin_trgm_ops);
```

`pg_trgm` is enabled in P1-T01.

Seed `search_synonyms`:

```sql
INSERT INTO search_synonyms (term, synonyms) VALUES
  ('mould',  ARRAY['mold', 'molds', 'moulds']),
  ('colour', ARRAY['color', 'colors', 'colours']),
  ('resin',  ARRAY['epoxy', 'epoxy resin']),
  ('mdf',    ARRAY['wood', 'mdf board', 'mdf cutout']),
  ('glitter',ARRAY['sparkle', 'shimmer']),
  ('acrylic',ARRAY['acrylic paint']),
  ('gsm',    ARRAY['grammage'])
ON CONFLICT (term) DO NOTHING;
```

# Acceptance criteria

- [ ] `fts` column exists and populates on insert/update (verify by inserting a product and querying `SELECT fts FROM products LIMIT 1`).
- [ ] GIN indexes exist (`\di` lists them).
- [ ] Synonym rows present.
- [ ] `search_logs` accepts inserts.

# Verification

```bash
cd web
pnpm dlx supabase db push
psql "$DB_URL" -c "SELECT count(*) FROM search_synonyms;"  # ≥ 7
```

# Dependencies added

None.

# Notes for next agent

(filled in when status → done)
