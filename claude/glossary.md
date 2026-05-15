# Glossary

Project vocabulary. When in doubt, prefer the term defined here over a synonym, so search and code stay coherent.

## Catalog

- **Product** — A single SKU sold on the storefront. Has a name, slug, category, base price, attributes, optional variants, images.
- **SKU** (Stock Keeping Unit) — Unique alphanumeric identifier for a product or variant. Stable across edits; never reused. Stored on `products.sku` and `product_variants.sku`. Always rendered in **JetBrains Mono**.
- **Slug** — URL-safe identifier. Lowercase, hyphenated, ≤ 80 chars, matches `^[a-z0-9-]+$`. Globally unique across all products. Globally unique across all categories (for MVP — see [ADR-005](decisions/ADR-005-newsreader-manrope-jetbrains-mono.md) sibling discussion in the master plan).
- **Variant** — A purchasable form of a product with its own SKU, price, and stock (e.g. "Acrylic Paint Red 50ml" vs "Acrylic Paint Red 100ml"). Modeled as `product_variants` rows joined to `product_options` and `product_option_values`.
- **Option** — A variant axis (e.g. "Size", "Color"). Modeled as `product_options`.
- **Option value** — A value along an axis (e.g. "50ml"). Modeled as `product_option_values`.
- **Attribute** — A structured property of a product used for faceted filtering (e.g. resin volume, paper GSM, paint type). Defined once in `attribute_definitions`, valued per product in `product_attributes`. Distinct from a tag (free-form) and from a variant axis (purchasable).
- **Tag** — A free-form keyword on a product. Used for cross-cutting groupings ("monsoon collection", "best for kids"). Not for faceted filtering — use attributes for that.
- **Category** — A taxonomic bucket. Self-referential tree via `categories.parent_id`. Storefront URL is `/c/<slug>`. Slugs are globally unique and specific (`resin-moulds`, not `moulds`).
- **Category path** — The breadcrumb chain from root to leaf (e.g. `["Art Stationery", "Paints & Colours", "3D Outliners"]`). Computed via the `category_with_descendants` recursive view.

## Workflow

- **`is_published`** — Boolean. The storefront RLS gate. `true` = visible to anon visitors. The single source of truth for "is this live?"
- **`review_status`** — Enum: `draft` / `needs_review` / `ready_to_publish` / `published` / `archived`. The admin workflow state. Invariant (trigger-enforced): `review_status='published'` ⇔ `is_published=true`; `review_status='archived'` ⇒ `is_published=false`.
- **`source`** — Enum on `products` (`manual`, `justkraft_seed`, `csv_import`, `ai_assisted`) and on `product_images` (`justkraft_seed`, `admin_upload`, `owner_provided`, `third_party_licensed`, `unknown`). Tells us provenance so we can scrub seed content pre-launch.
- **`license_status`** — Enum on `product_images` (`unverified` / `owned` / `licensed` / `public_domain` / `disputed` / `removed`). Public RLS requires `IN ('owned','licensed','public_domain')`.

## Auth / roles

- **`profiles.role`** — `owner` / `admin` / `editor` / `viewer`. `owner` and `admin` have full write. `editor` writes but cannot manage other users. `viewer` is read-only including unpublished.
- **Admin** — Anyone with `role IN ('owner','admin','editor')`. Synonymous with "can write to the catalog."
- **Storefront** — The public Next.js routes (`/`, `/c/<slug>`, `/p/<slug>`, `/search`). Server-rendered with ISR + tag revalidation.

## Storage / infra

- **Bucket** — A Supabase Storage namespace. We use `product-images` for uploaded photos.
- **Storage path** — The path inside a bucket, e.g. `<product_id>/<uuid>.webp`. Stored on `product_images.storage_path`. `null` means the image is hotlinked from a third-party URL (only acceptable for `source='justkraft_seed'` dev rows).
- **ISR** — Incremental Static Regeneration. Storefront pages render statically, revalidate after 60 s, and on demand via `revalidateTag()` after admin mutations.
- **RLS** — Row Level Security. Every Postgres table has policies that restrict who can read/write which rows.

## Build / process

- **Phase** — One of 6 chunks of work (Phase 0 → Phase 5). See `plans.md`.
- **Task** — A unit of work captured in a file under `tasks/phase-N-*/PN-TXX-*.md`. 60–180 lines. Has frontmatter (`id`, `status`, `depends_on`, `estimate_hours`, `last_updated`).
- **Task status** — `not_started` / `in_progress` / `done` / `blocked`. Mirrored in `plans.md` (⬜/🟡/✅/🚧) and `progress.md`.
- **Real-content gate** — Hard gate between Phase 3 and Phase 4 polish. See `blockers.md`.

## AI

- **`ai_generations`** — Table where every Claude API call is logged (input hash, output JSON, validation status, accepted by, cost).
- **Prompt version** — A string tag (`v1`, `v2`, …) on every system prompt in `web/src/lib/ai/prompts/`. Lets us replay historical generations and A/B test prompts.
- **Assistive AI** — Our policy. AI proposes; admin reviews; admin accepts. Nothing AI-generated auto-publishes.

## Other

- **MVP** — Catalog + admin CRUD + cart only. No checkout, no payments, no customer accounts, no creator community. See master plan §"MVP scope (locked)".
- **The Atlas** — The landing-page category grid (2×4 tiles, real product photo per tile, Newsreader category name overlay).
- **Just Kraft** — The competitor whose catalog we scraped as a dev seed. Always `is_published=false`, `source='justkraft_seed'`. Scrubbed pre-launch via launch-blocker SQL.
