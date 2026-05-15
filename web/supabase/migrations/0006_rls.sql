-- 0006_rls.sql — Row Level Security policies on every table
--
-- rollback:
--   For each table touched below:
--     ALTER TABLE public.<name> DISABLE ROW LEVEL SECURITY;
--     DROP POLICY IF EXISTS <name>_public_select ON public.<name>;
--     DROP POLICY IF EXISTS <name>_admin_write  ON public.<name>;
--     (etc — see policy names below)
--
-- What this migration contains:
--   - Enables RLS on every public.* table
--   - Public-select policies on parent catalog tables
--   - Public-select policies on child catalog tables via EXISTS subqueries
--     joining back to products(is_published, deleted_at)
--   - Admin write (INSERT/UPDATE/DELETE) policies using public.is_admin()
--   - Admin-only SELECT on ops tables; no client INSERT (service-role only)
--   - Smoke block that asserts every expected policy was created
--
-- See claude/architecture/security.md §"RLS policies"
--     claude/runbooks/launch-blockers.sql (anon-client probe at deploy time)


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Enable RLS on every table                                 │
-- ╰──────────────────────────────────────────────────────────────╯
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_option_values   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_run_rows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_synonyms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs             ENABLE ROW LEVEL SECURITY;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. profiles                                                  │
-- ╰──────────────────────────────────────────────────────────────╯
-- A user can read their own profile. Admins can read all.
-- Updates: only admins; users do NOT self-edit role.
CREATE POLICY profiles_self_select  ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_admin_write  ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. Public catalog parents                                    │
-- ╰──────────────────────────────────────────────────────────────╯
-- Anyone can read non-deleted categories / tags / attribute_definitions
-- (these are taxonomy; no is_published gate).
CREATE POLICY categories_public_select  ON public.categories
  FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY tags_public_select  ON public.tags
  FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY attribute_definitions_public_select  ON public.attribute_definitions
  FOR SELECT USING (true);
CREATE POLICY search_synonyms_public_select  ON public.search_synonyms
  FOR SELECT USING (true);  -- read by the search expander on every search

-- Admin write on all of these.
CREATE POLICY categories_admin_write  ON public.categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY tags_admin_write  ON public.tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY attribute_definitions_admin_write  ON public.attribute_definitions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY search_synonyms_admin_write  ON public.search_synonyms
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. products — the storefront gate                            │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE POLICY products_public_select  ON public.products
  FOR SELECT USING (deleted_at IS NULL AND is_published = true);
CREATE POLICY products_admin_write  ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. Child catalog tables — EXISTS subquery to parent          │
-- ╰──────────────────────────────────────────────────────────────╯
-- Public-select on child rows requires the parent product to be
-- published + not soft-deleted. product_images additionally requires
-- the image's license_status to be in the served set.

CREATE POLICY product_images_public_select  ON public.product_images
  FOR SELECT USING (
    deleted_at IS NULL
    AND license_status IN ('owned', 'licensed', 'public_domain')
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY product_variants_public_select  ON public.product_variants
  FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY product_attributes_public_select  ON public.product_attributes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_attributes.product_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY product_tags_public_select  ON public.product_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_tags.product_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

-- product_options is a child of products too — same pattern.
CREATE POLICY product_options_public_select  ON public.product_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_options.product_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

-- product_option_values is a grandchild — go through product_options.
CREATE POLICY product_option_values_public_select  ON public.product_option_values
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.product_options o
      JOIN public.products p ON p.id = o.product_id
      WHERE o.id = product_option_values.option_id
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

-- variant_option_values is a great-grandchild — through variant + product.
CREATE POLICY variant_option_values_public_select  ON public.variant_option_values
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
      WHERE v.id = variant_option_values.variant_id
        AND v.deleted_at IS NULL
        AND p.is_published = true
        AND p.deleted_at IS NULL
    )
  );

-- Admin write on every child catalog table.
CREATE POLICY product_images_admin_write  ON public.product_images
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_variants_admin_write  ON public.product_variants
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_attributes_admin_write  ON public.product_attributes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_tags_admin_write  ON public.product_tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_options_admin_write  ON public.product_options
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY product_option_values_admin_write  ON public.product_option_values
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY variant_option_values_admin_write  ON public.variant_option_values
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 6. Ops tables — admin SELECT only; writes via service-role   │
-- ╰──────────────────────────────────────────────────────────────╯
-- Insert / Update / Delete on these tables happens exclusively via
-- the service-role client in server actions. We do NOT create write
-- policies for the authenticated role — anything that goes through
-- the cookie-authed client is blocked by default (no policy = no access).

CREATE POLICY audit_logs_admin_select  ON public.audit_logs
  FOR SELECT USING (public.is_admin());

CREATE POLICY background_jobs_admin_select  ON public.background_jobs
  FOR SELECT USING (public.is_admin());

CREATE POLICY job_events_admin_select  ON public.job_events
  FOR SELECT USING (public.is_admin());

CREATE POLICY import_runs_admin_select  ON public.import_runs
  FOR SELECT USING (public.is_admin());

CREATE POLICY import_run_rows_admin_select  ON public.import_run_rows
  FOR SELECT USING (public.is_admin());

CREATE POLICY ai_generations_admin_select  ON public.ai_generations
  FOR SELECT USING (public.is_admin());

-- search_logs: admins can read everything; users cannot read logs (PII).
-- Inserts happen via service-role (waitUntil-async from server actions).
CREATE POLICY search_logs_admin_select  ON public.search_logs
  FOR SELECT USING (public.is_admin());


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 7. Smoke: assert every expected policy was created           │
-- ╰──────────────────────────────────────────────────────────────╯
-- A runtime attack test using an anon Supabase client lives in
-- scripts/launch-blockers.ts (created in P1-T10). Here we just
-- verify the policies exist by name + count per table, so the
-- migration fails loudly if a table is missing RLS or a policy.

DO $$
DECLARE
  expected_policies CONSTANT text[] := ARRAY[
    'profiles_self_select', 'profiles_admin_write',
    'categories_public_select', 'categories_admin_write',
    'tags_public_select', 'tags_admin_write',
    'attribute_definitions_public_select', 'attribute_definitions_admin_write',
    'search_synonyms_public_select', 'search_synonyms_admin_write',
    'products_public_select', 'products_admin_write',
    'product_images_public_select', 'product_images_admin_write',
    'product_variants_public_select', 'product_variants_admin_write',
    'product_attributes_public_select', 'product_attributes_admin_write',
    'product_tags_public_select', 'product_tags_admin_write',
    'product_options_public_select', 'product_options_admin_write',
    'product_option_values_public_select', 'product_option_values_admin_write',
    'variant_option_values_public_select', 'variant_option_values_admin_write',
    'audit_logs_admin_select',
    'background_jobs_admin_select',
    'job_events_admin_select',
    'import_runs_admin_select',
    'import_run_rows_admin_select',
    'ai_generations_admin_select',
    'search_logs_admin_select'
  ];
  pol text;
  found int;
BEGIN
  FOREACH pol IN ARRAY expected_policies LOOP
    SELECT count(*) INTO found
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = pol;
    IF found <> 1 THEN
      RAISE EXCEPTION 'Smoke FAIL: policy % missing (found % matching rows)', pol, found;
    END IF;
  END LOOP;

  -- Every public.* table must have RLS enabled.
  SELECT count(*) INTO found
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t.tablename
        AND c.relrowsecurity = true
    );
  IF found > 0 THEN
    RAISE EXCEPTION 'Smoke FAIL: % public table(s) without RLS enabled', found;
  END IF;
END $$;
