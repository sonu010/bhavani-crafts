-- 0001_init.sql — core catalog tables: profiles, categories, products
--
-- rollback:
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP TABLE IF EXISTS public.products, public.categories, public.profiles CASCADE;
--   DROP FUNCTION IF EXISTS public.handle_new_user, public.set_updated_at, public.is_admin CASCADE;
--   DROP TYPE IF EXISTS review_status, product_source, stock_status, profile_role;
--   DROP EXTENSION IF EXISTS unaccent, pg_trgm;  -- leave pgcrypto (Supabase-managed)
--
-- What this migration contains:
--   4 enums              profile_role, stock_status, product_source, review_status
--   3 extensions         pgcrypto, pg_trgm, unaccent
--   2 helper functions   public.set_updated_at(), public.is_admin()
--   3 tables             public.profiles, public.categories, public.products
--   1 auth trigger       on_auth_user_created → auto-creates a profiles row
--   3 updated_at triggers (one per table)
--
-- What this migration does NOT contain (intentional — separate migrations):
--   - Attributes (0002_attributes.sql, P1-T02)
--   - Variants + options + images + tags (0003_variants_images_tags.sql, P1-T03)
--   - Ops tables + publish-state trigger (0004_ops_tables.sql, P1-T04)
--   - Search column + indexes (0005_search.sql, P1-T05)
--   - RLS policies (0006_rls.sql, P1-T06)
--   - Catalog indexes + category_with_descendants view (0007_indexes_views.sql, P1-T07)
--
-- See: claude/architecture/database-schema.md (authoritative spec)
--      claude/tasks/phase-1-foundation/P1-T01-migration-core-tables.md (this task)


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Extensions                                                │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram fuzzy match (used in P1-T05)
CREATE EXTENSION IF NOT EXISTS unaccent;     -- diacritic-insensitive search


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. Enums                                                     │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TYPE profile_role AS ENUM (
  'owner',    -- the Bhavani Crafts owner; exactly one expected
  'admin',    -- staff with full catalog write
  'editor',   -- reserved for narrower scope later
  'viewer'    -- read-only including unpublished; default for new sign-ups
);

CREATE TYPE stock_status AS ENUM (
  'in_stock',
  'low_stock',
  'out_of_stock',
  'made_to_order',
  'unknown'
);

CREATE TYPE product_source AS ENUM (
  'manual',         -- entered via admin form
  'justkraft_seed', -- imported from the competitor scrape; dev only
  'csv_import',     -- bulk CSV import
  'ai_assisted'     -- AI-drafted content, admin-accepted
);

CREATE TYPE review_status AS ENUM (
  'draft',             -- being built; admin alone
  'needs_review',      -- AI-assisted or imported; awaiting owner pass
  'ready_to_publish',  -- vetted; one click from going live
  'published',         -- live on storefront (must align with is_published=true)
  'archived'           -- removed from storefront (is_published=false)
);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. Helper functions                                          │
-- ╰──────────────────────────────────────────────────────────────╯

-- Touch updated_at on every UPDATE. Reused by all tables.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Cheap admin check used by RLS policies (lands in 0006_rls.sql).
-- STABLE so Postgres can cache the result within a single transaction.
-- SECURITY DEFINER so it can read profiles regardless of caller's row-level perms.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
  );
$$;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. profiles                                                  │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        profile_role NOT NULL DEFAULT 'viewer',
  full_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles
  IS '1:1 with auth.users. profile.role gates write access.';
COMMENT ON COLUMN public.profiles.role
  IS 'Default is viewer. Owner is promoted manually via SQL on first login. See runbooks/promote-admin-user.md';

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row when a new auth.users row arrives.
-- SECURITY DEFINER so the trigger can insert regardless of caller.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. categories — self-referential tree, globally unique slugs │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE
                      CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name              text NOT NULL,
  description       text,
  parent_id         uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  sort_order        int NOT NULL DEFAULT 0,
  image_url         text,
  meta_title        text,
  meta_description  text,
  deleted_at        timestamptz,
  deleted_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.categories
  IS 'Self-referential tree. Slugs are globally unique. URL is /c/<slug>, never nested. Use specific slugs (resin-moulds), never generic (moulds).';

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 6. products                                                  │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.products (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                    text NOT NULL UNIQUE,
  slug                   text NOT NULL UNIQUE
                           CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name                   text NOT NULL,
  description            text,                                    -- markdown
  short_description      text CHECK (
                           short_description IS NULL
                           OR char_length(short_description) <= 280
                         ),
  category_id            uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  base_price_inr         numeric(10, 2),                          -- NULL = "Price on request"
  compare_at_price_inr   numeric(10, 2)
                           CHECK (
                             compare_at_price_inr IS NULL
                             OR base_price_inr IS NULL
                             OR compare_at_price_inr > base_price_inr
                           ),
  stock_status           stock_status NOT NULL DEFAULT 'unknown',
  stock_quantity         int CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  low_stock_threshold    int NOT NULL DEFAULT 5
                           CHECK (low_stock_threshold >= 0),
  allow_backorder        boolean NOT NULL DEFAULT false,
  reserved_quantity      int NOT NULL DEFAULT 0
                           CHECK (reserved_quantity >= 0),
  min_order_qty          int NOT NULL DEFAULT 1
                           CHECK (min_order_qty >= 1),
  max_order_qty          int CHECK (
                           max_order_qty IS NULL
                           OR max_order_qty >= min_order_qty
                         ),
  is_published           boolean NOT NULL DEFAULT false,
  review_status          review_status NOT NULL DEFAULT 'draft',
  is_featured            boolean NOT NULL DEFAULT false,
  source                 product_source NOT NULL DEFAULT 'manual',
  source_url             text,
  meta_title             text,
  meta_description       text,
  canonical_url          text,
  deleted_at             timestamptz,
  deleted_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.products
  IS 'The catalog. is_published is the storefront RLS gate; review_status is the admin workflow state.';
COMMENT ON COLUMN public.products.base_price_inr
  IS 'NULL means "Price on request" — surface accordingly in admin + storefront.';
COMMENT ON COLUMN public.products.review_status
  IS 'Workflow. Trigger in 0004_ops_tables.sql will enforce alignment with is_published.';
COMMENT ON COLUMN public.products.source
  IS 'Provenance. justkraft_seed rows are dev-only; launch-blocker SQL refuses to ship them.';

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 7. Smoke insert (rolled back) — fails the migration loudly   │
-- │    if anything above is structurally broken                  │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  cat_id uuid;
BEGIN
  INSERT INTO public.categories (slug, name)
  VALUES ('__smoke_test__', 'Smoke test')
  RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, category_id)
  VALUES ('__SMOKE__', '__smoke_test__', 'Smoke product', cat_id);

  -- Roll back the smoke rows so the schema lands clean.
  DELETE FROM public.products WHERE sku = '__SMOKE__';
  DELETE FROM public.categories WHERE slug = '__smoke_test__';
END $$;
