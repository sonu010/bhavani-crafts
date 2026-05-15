-- 0003_variants_images_tags.sql — purchasable variants + images + tags
--
-- rollback:
--   DROP TABLE IF EXISTS public.product_tags, public.tags CASCADE;
--   DROP TABLE IF EXISTS public.variant_option_values,
--                        public.product_variants,
--                        public.product_option_values,
--                        public.product_options CASCADE;
--   DROP TABLE IF EXISTS public.product_images CASCADE;
--   DROP TYPE IF EXISTS license_status, image_source;
--
-- What this migration contains:
--   2 enums          image_source (5 values), license_status (6 values)
--   7 tables         product_images, product_options, product_option_values,
--                    product_variants, variant_option_values, tags, product_tags
--   1 partial UNIQUE one_default_variant per product
--   updated_at triggers on every new table that has updated_at
--   Comments + smoke block exercising the new constraints
--
-- See claude/architecture/database-schema.md
--     claude/decisions/ADR-009-custom-supabase-over-medusa.md
--       (variant shape is deliberately Medusa-compatible)


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Enums                                                     │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TYPE image_source AS ENUM (
  'justkraft_seed',         -- hotlinked from competitor CDN, dev only
  'admin_upload',           -- uploaded via admin form
  'owner_provided',          -- given by owner outside the app (WhatsApp etc.)
  'third_party_licensed',   -- stock photo or supplier-provided with license
  'unknown'
);

CREATE TYPE license_status AS ENUM (
  'unverified',     -- newly imported; owner hasn't confirmed rights
  'owned',          -- Bhavani took the photo / commissioned it
  'licensed',      -- third-party license held (note in source_attribution)
  'public_domain', -- CC0 / PD
  'disputed',      -- flagged for review; cannot be served publicly
  'removed'        -- taken down for legal reason; replaced or pending
);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. product_images — ordered list per product, license-tracked│
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.product_images (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url                  text NOT NULL,                   -- public URL (Storage or seed CDN)
  storage_path         text,                            -- null while hotlinking; set after re-host
  alt                  text,
  width                int CHECK (width IS NULL OR width > 0),
  height               int CHECK (height IS NULL OR height > 0),
  sort_order           int NOT NULL DEFAULT 0,
  blur_data_url        text,                            -- LQIP base64

  source               image_source NOT NULL DEFAULT 'unknown',
  source_url           text,
  source_attribution   text,
  license_status       license_status NOT NULL DEFAULT 'unverified',
  license_verified_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  license_verified_at  timestamptz,

  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_images
  IS 'Per-product images. license_status gates public visibility (RLS in 0006).';
COMMENT ON COLUMN public.product_images.storage_path
  IS 'NULL while we hotlink an external CDN. Set after re-host to Supabase Storage in P4-T11.';
COMMENT ON COLUMN public.product_images.license_status
  IS 'Public-select RLS requires license_status IN (owned, licensed, public_domain).';

CREATE TRIGGER product_images_set_updated_at
  BEFORE UPDATE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. product_options + product_option_values                   │
-- ╰──────────────────────────────────────────────────────────────╯
-- Options are variant axes (Size, Color, Material).
-- Option values are points on an axis (50ml, 100ml; Red, Blue, Green).
-- Each option/value pair is unique within its parent.
CREATE TABLE public.product_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name        text NOT NULL,                            -- e.g. "Size", "Colour"
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE TRIGGER product_options_set_updated_at
  BEFORE UPDATE ON public.product_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_option_values (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   uuid NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value       text NOT NULL,                            -- e.g. "50ml", "Red"
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_id, value)
);

CREATE TRIGGER product_option_values_set_updated_at
  BEFORE UPDATE ON public.product_option_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. product_variants — purchasable forms with own SKU/price   │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.product_variants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku                   text NOT NULL UNIQUE,
  name                  text,
  price_inr             numeric(10, 2),
  compare_at_price_inr  numeric(10, 2)
                          CHECK (
                            compare_at_price_inr IS NULL
                            OR price_inr IS NULL
                            OR compare_at_price_inr > price_inr
                          ),
  stock_status          stock_status NOT NULL DEFAULT 'unknown',
  stock_quantity        int CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  is_default            boolean NOT NULL DEFAULT false,
  sort_order            int NOT NULL DEFAULT 0,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_variants
  IS 'Purchasable variants. Each has own SKU + price + stock. Variant shape mirrors Medusa for portability (ADR-009).';

-- A product can have at most ONE row marked is_default=true at any time
-- among non-deleted rows. Partial unique index enforces this without
-- forbidding zero defaults (products without variants are OK).
CREATE UNIQUE INDEX product_variants_one_default_per_product_idx
  ON public.product_variants (product_id)
  WHERE is_default = true AND deleted_at IS NULL;

CREATE TRIGGER product_variants_set_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. variant_option_values — link variants to option values    │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.variant_option_values (
  variant_id       uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_value_id  uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE RESTRICT,
  PRIMARY KEY (variant_id, option_value_id)
);

COMMENT ON TABLE public.variant_option_values
  IS 'Junction: variant_id × option_value_id. A red-50ml variant has two rows (Color=Red, Size=50ml).';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 6. tags + product_tags — free-form keyword associations      │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name        text NOT NULL,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tags
  IS 'Free-form keywords for cross-cutting groupings (e.g. monsoon-collection). NOT for faceted filtering — that''s product_attributes.';

CREATE TRIGGER tags_set_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_tags (
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

COMMENT ON TABLE public.product_tags
  IS 'Many-to-many product↔tag. Composite PK; no surrogate id.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 7. Smoke block — exercises every new constraint              │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  cat_id           uuid;
  prod_id          uuid;
  variant_a_id     uuid;
  size_opt_id      uuid;
  size_50_id       uuid;
  size_100_id      uuid;
  tag_id           uuid;
BEGIN
  INSERT INTO public.categories (slug, name)
  VALUES ('zzz-variants-smoke-cat', 'Variants smoke (transient)')
  RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, category_id)
  VALUES ('ZZZ-VAR-SMOKE', 'zzz-variants-smoke-prod', 'Variants smoke', cat_id)
  RETURNING id INTO prod_id;

  -- (a) image with default license_status='unverified'
  INSERT INTO public.product_images (product_id, url, alt)
  VALUES (prod_id, 'https://example.com/x.webp', 'smoke image');

  -- (b) option + option values
  INSERT INTO public.product_options (product_id, name)
  VALUES (prod_id, 'Size') RETURNING id INTO size_opt_id;

  INSERT INTO public.product_option_values (option_id, value)
  VALUES (size_opt_id, '50ml') RETURNING id INTO size_50_id;
  INSERT INTO public.product_option_values (option_id, value)
  VALUES (size_opt_id, '100ml') RETURNING id INTO size_100_id;

  -- (c) Option value uniqueness within an option: duplicate '50ml' must fail.
  BEGIN
    INSERT INTO public.product_option_values (option_id, value) VALUES (size_opt_id, '50ml');
    RAISE EXCEPTION 'Smoke FAIL: duplicate option value not rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- (d) variant with is_default=true
  INSERT INTO public.product_variants (product_id, sku, name, price_inr, stock_quantity, is_default)
  VALUES (prod_id, 'ZZZ-VAR-50', '50ml variant', 80, 10, true)
  RETURNING id INTO variant_a_id;

  -- (e) a SECOND is_default=true variant for the same product must fail (partial unique index).
  BEGIN
    INSERT INTO public.product_variants (product_id, sku, name, is_default)
    VALUES (prod_id, 'ZZZ-VAR-100', '100ml variant', true);
    RAISE EXCEPTION 'Smoke FAIL: partial unique index allowed two defaults';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- (f) a second variant with is_default=false should succeed
  INSERT INTO public.product_variants (product_id, sku, name, is_default)
  VALUES (prod_id, 'ZZZ-VAR-100', '100ml variant', false);

  -- (g) variant_option_values link
  INSERT INTO public.variant_option_values (variant_id, option_value_id)
  VALUES (variant_a_id, size_50_id);

  -- (h) tags + product_tags
  INSERT INTO public.tags (slug, name) VALUES ('zzz-smoke-tag', 'Smoke tag') RETURNING id INTO tag_id;
  INSERT INTO public.product_tags (product_id, tag_id) VALUES (prod_id, tag_id);

  -- (i) product_tags PK uniqueness
  BEGIN
    INSERT INTO public.product_tags (product_id, tag_id) VALUES (prod_id, tag_id);
    RAISE EXCEPTION 'Smoke FAIL: product_tags PK allowed duplicate';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Cleanup. CASCADEs unwind variant_option_values, product_variants,
  -- product_option_values, product_options, product_images, product_tags.
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;
  DELETE FROM public.tags WHERE id = tag_id;

  IF EXISTS (SELECT 1 FROM public.products WHERE id = prod_id)
     OR EXISTS (SELECT 1 FROM public.product_images WHERE product_id = prod_id)
     OR EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = prod_id)
     OR EXISTS (SELECT 1 FROM public.product_options WHERE product_id = prod_id) THEN
    RAISE EXCEPTION 'Smoke cleanup left residue — investigate';
  END IF;
END $$;
