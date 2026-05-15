-- 0002_attributes.sql — product attribute (facet) model
--
-- rollback:
--   DROP TABLE IF EXISTS public.product_attributes CASCADE;
--   DROP TABLE IF EXISTS public.attribute_definitions CASCADE;
--   DROP TYPE IF EXISTS attribute_type;
--
-- What this migration contains:
--   1 enum               attribute_type (text|number|boolean|select)
--   2 tables             attribute_definitions, product_attributes
--   1 updated_at trigger on attribute_definitions
--   Check constraints    exactly one of {value_text,value_number,value_boolean}
--                        is non-null on product_attributes, and matches the
--                        parent attribute_definition's `type`
--   1 helper function    public.product_attributes_check_value_type()  (trigger)
--   Seed                 6 starter attribute definitions for common craft fields
--
-- See claude/architecture/database-schema.md §"Attribute / facet model"


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Enum                                                      │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TYPE attribute_type AS ENUM (
  'text',     -- value_text holds a free string
  'number',   -- value_number; unit may apply (e.g. ml, gsm, mm)
  'boolean',  -- value_boolean
  'select'    -- value_text; constrained to options in options_json
);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. attribute_definitions                                     │
-- ╰──────────────────────────────────────────────────────────────╯
-- One row per facet (e.g. "Volume", "GSM", "Food-safe").
-- applies_to_category_id NULL = applies globally; non-NULL scopes the facet
-- to a specific category subtree (resolved via category_with_descendants
-- view in P1-T07).
CREATE TABLE public.attribute_definitions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text NOT NULL UNIQUE
                             CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name                     text NOT NULL,
  type                     attribute_type NOT NULL,
  unit                     text,                                        -- 'ml', 'gsm', 'mm', etc.
  applies_to_category_id   uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  options_json             jsonb,                                       -- for type='select': an array of allowed string values
  is_filterable            boolean NOT NULL DEFAULT true,
  sort_order               int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- 'select' attributes must have non-null options_json with at least one option;
  -- other types must not abuse options_json.
  CONSTRAINT attribute_definitions_select_has_options CHECK (
    (type = 'select' AND options_json IS NOT NULL AND jsonb_typeof(options_json) = 'array' AND jsonb_array_length(options_json) > 0)
    OR (type != 'select')
  )
);

COMMENT ON TABLE public.attribute_definitions
  IS 'Faceted-filter definitions. Per-category scope via applies_to_category_id.';
COMMENT ON COLUMN public.attribute_definitions.applies_to_category_id
  IS 'NULL = applies to all categories. Non-NULL scopes the facet to that category subtree.';
COMMENT ON COLUMN public.attribute_definitions.options_json
  IS 'For type=select only: jsonb array of allowed string values, e.g. ["Glossy","Matte"].';

CREATE TRIGGER attribute_definitions_set_updated_at
  BEFORE UPDATE ON public.attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. product_attributes                                        │
-- ╰──────────────────────────────────────────────────────────────╯
-- One row per (product, attribute) pair. Composite PK (no surrogate id).
-- Exactly one of value_text/value_number/value_boolean is non-null,
-- and the populated column must match attribute_definitions.type.
CREATE TABLE public.product_attributes (
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  attribute_id   uuid NOT NULL REFERENCES public.attribute_definitions(id) ON DELETE RESTRICT,
  value_text     text,
  value_number   numeric,
  value_boolean  boolean,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Composite PK enforces one value per (product, attribute).
  PRIMARY KEY (product_id, attribute_id),

  -- Exactly one of the three value columns is non-null.
  CONSTRAINT product_attributes_one_value CHECK (
    (CASE WHEN value_text    IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN value_number  IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END)
  = 1
  )
);

COMMENT ON TABLE public.product_attributes
  IS 'Per-product attribute values. Composite PK on (product_id, attribute_id).';

-- The value-type-matches-definition check has to be a trigger (not a CHECK
-- constraint) because it references another table.
CREATE OR REPLACE FUNCTION public.product_attributes_check_value_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  def_type attribute_type;
  allowed_options jsonb;
BEGIN
  SELECT type, options_json
  INTO def_type, allowed_options
  FROM public.attribute_definitions
  WHERE id = NEW.attribute_id;

  IF def_type IS NULL THEN
    RAISE EXCEPTION 'attribute_definitions row not found for attribute_id %', NEW.attribute_id;
  END IF;

  IF def_type = 'text' AND NEW.value_text IS NULL THEN
    RAISE EXCEPTION 'attribute % is type=text but value_text is NULL', NEW.attribute_id;
  ELSIF def_type = 'number' AND NEW.value_number IS NULL THEN
    RAISE EXCEPTION 'attribute % is type=number but value_number is NULL', NEW.attribute_id;
  ELSIF def_type = 'boolean' AND NEW.value_boolean IS NULL THEN
    RAISE EXCEPTION 'attribute % is type=boolean but value_boolean is NULL', NEW.attribute_id;
  ELSIF def_type = 'select' THEN
    IF NEW.value_text IS NULL THEN
      RAISE EXCEPTION 'attribute % is type=select but value_text is NULL', NEW.attribute_id;
    END IF;
    IF allowed_options IS NOT NULL AND NOT (allowed_options @> to_jsonb(NEW.value_text)) THEN
      RAISE EXCEPTION 'attribute % select value % not in allowed options %',
        NEW.attribute_id, NEW.value_text, allowed_options;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_attributes_validate_value_type
  BEFORE INSERT OR UPDATE ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.product_attributes_check_value_type();

CREATE TRIGGER product_attributes_set_updated_at
  BEFORE UPDATE ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. Seed common craft-supply attributes                       │
-- ╰──────────────────────────────────────────────────────────────╯
-- Owner can edit/extend these via the admin UI in P2-T22. Conservative
-- starter set; safe to add more later, but think twice before removing
-- (existing product_attributes rows will block ON DELETE RESTRICT).
INSERT INTO public.attribute_definitions (slug, name, type, unit, sort_order) VALUES
  ('volume-ml',      'Volume',         'number',  'ml',    10),
  ('weight-g',       'Weight',         'number',  'g',     20),
  ('gsm',            'GSM',            'number',  'gsm',   30),
  ('length-mm',      'Length',         'number',  'mm',    40),
  ('pack-quantity',  'Pack quantity',  'number',  'units', 50),
  ('is-food-safe',   'Food-safe',      'boolean', NULL,    60);

INSERT INTO public.attribute_definitions (slug, name, type, options_json, sort_order) VALUES
  ('finish',  'Finish',  'select', '["Glossy","Matte","Satin"]'::jsonb, 70);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. Smoke insert (rolled back) — validates the value-type     │
-- │    trigger AND the composite PK AND the one-value CHECK      │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  cat_id uuid;
  prod_id uuid;
  vol_attr_id uuid;
  food_attr_id uuid;
BEGIN
  -- Smoke fixtures (slugs match the regex).
  INSERT INTO public.categories (slug, name)
  VALUES ('zzz-attrs-smoke-cat', 'Attrs smoke (transient)')
  RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, category_id)
  VALUES ('ZZZ-ATTRS-SMOKE', 'zzz-attrs-smoke-prod', 'Attrs smoke (transient)', cat_id)
  RETURNING id INTO prod_id;

  SELECT id INTO vol_attr_id FROM public.attribute_definitions WHERE slug = 'volume-ml';
  SELECT id INTO food_attr_id FROM public.attribute_definitions WHERE slug = 'is-food-safe';

  -- (a) Happy path: type=number with value_number.
  INSERT INTO public.product_attributes (product_id, attribute_id, value_number)
  VALUES (prod_id, vol_attr_id, 100);

  -- (b) Happy path: type=boolean with value_boolean.
  INSERT INTO public.product_attributes (product_id, attribute_id, value_boolean)
  VALUES (prod_id, food_attr_id, true);

  -- (c) Type-mismatch: type=number but value_text — must fail.
  BEGIN
    INSERT INTO public.product_attributes (product_id, attribute_id, value_text)
    VALUES (prod_id, vol_attr_id, 'hundred');
    RAISE EXCEPTION 'Smoke FAIL: expected type-mismatch error for (number,value_text) was not raised';
  EXCEPTION WHEN OTHERS THEN
    -- Expected. Continue.
    NULL;
  END;

  -- (d) Two values populated: CHECK constraint must reject.
  BEGIN
    INSERT INTO public.product_attributes (product_id, attribute_id, value_number, value_text)
    VALUES (prod_id, vol_attr_id, 50, 'fifty');
    RAISE EXCEPTION 'Smoke FAIL: expected one-value CHECK to reject two-value insert';
  EXCEPTION WHEN check_violation THEN
    -- Expected. Continue.
    NULL;
  END;

  -- (e) Composite PK violation: same (product, attribute) again.
  BEGIN
    INSERT INTO public.product_attributes (product_id, attribute_id, value_number)
    VALUES (prod_id, vol_attr_id, 200);
    RAISE EXCEPTION 'Smoke FAIL: expected composite-PK conflict for duplicate (product,attribute)';
  EXCEPTION WHEN unique_violation THEN
    -- Expected. Continue.
    NULL;
  END;

  -- Cleanup.
  DELETE FROM public.product_attributes WHERE product_id = prod_id;
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;

  IF EXISTS (SELECT 1 FROM public.products WHERE id = prod_id)
     OR EXISTS (SELECT 1 FROM public.product_attributes WHERE product_id = prod_id) THEN
    RAISE EXCEPTION 'Smoke cleanup left residue — investigate';
  END IF;
END $$;
