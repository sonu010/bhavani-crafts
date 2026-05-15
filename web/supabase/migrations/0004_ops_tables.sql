-- 0004_ops_tables.sql — operational tables + publish-state trigger
--
-- rollback:
--   DROP TRIGGER IF EXISTS products_publish_state_consistency ON public.products;
--   DROP FUNCTION IF EXISTS public.enforce_publish_state CASCADE;
--   DROP TABLE IF EXISTS public.ai_generations,
--                        public.import_run_rows, public.import_runs,
--                        public.job_events, public.background_jobs,
--                        public.audit_logs CASCADE;
--   DROP TYPE IF EXISTS ai_generation_status, ai_task_type,
--                       import_action, job_status;
--
-- What this migration contains:
--   4 enums              job_status, import_action, ai_task_type, ai_generation_status
--   6 tables             audit_logs, background_jobs, job_events, import_runs,
--                        import_run_rows, ai_generations
--   1 trigger function   public.enforce_publish_state()
--   1 trigger            products_publish_state_consistency (BEFORE INSERT OR UPDATE)
--   Smoke block          exercises trigger rejection in both directions
--
-- See claude/architecture/database-schema.md §"Ops tables"
--     claude/architecture/background-jobs.md (the state machine)
--     claude/architecture/observability.md (audit_logs usage)


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Enums                                                     │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TYPE job_status AS ENUM (
  'queued', 'running', 'succeeded', 'failed', 'cancelled'
);

CREATE TYPE import_action AS ENUM (
  'create', 'update', 'skip', 'error'
);

CREATE TYPE ai_task_type AS ENUM (
  'category_suggest',
  'tag_suggest',
  'alt_text',
  'description_draft',
  'duplicate_detect',
  'csv_cleanup',
  'search_synonym_mine'
);

CREATE TYPE ai_generation_status AS ENUM (
  'proposed', 'accepted', 'rejected', 'semantic_fail'
);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. audit_logs — every admin mutation                         │
-- ╰──────────────────────────────────────────────────────────────╯
-- Insert via service-role only (no RLS insert policy in 0006).
-- Convention: action uses dotted strings — 'product.create',
-- 'product.update', 'product.delete', 'category.update', etc.
CREATE TABLE public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs
  IS 'Append-only. Every admin mutation writes a row. Read-only at /admin/activity.';
COMMENT ON COLUMN public.audit_logs.action
  IS 'Convention: <entity>.<verb>, e.g. product.update, category.delete, image.reorder.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. background_jobs + job_events — chunked job state machine  │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.background_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,                            -- 'bulk_publish', 'csv_import', 'image_rehost', ...
  status       job_status NOT NULL DEFAULT 'queued',
  payload_json jsonb,
  result_json  jsonb,
  error        text,
  progress     int NOT NULL DEFAULT 0 CHECK (progress >= 0),
  total        int NOT NULL DEFAULT 0 CHECK (total >= 0),
  checkpoint   jsonb,                                    -- cursor for resume between chunks
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

COMMENT ON TABLE public.background_jobs
  IS 'Chunked-resumable job state. See architecture/background-jobs.md for the state machine.';
-- NB: no updated_at column / trigger on background_jobs. The workers
-- update status / progress / checkpoint / finished_at directly; the
-- row's own timestamps stay authoritative.

CREATE TABLE public.job_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  level      text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message    text NOT NULL,
  data_json  jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_events
  IS 'Per-chunk events for a background_job. Read in the admin job detail view.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. import_runs + import_run_rows                             │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.import_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       text,
  status         job_status NOT NULL DEFAULT 'queued',
  total_rows     int NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  success_count  int NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  error_count    int NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE TABLE public.import_run_rows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id  uuid NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
  row_number     int NOT NULL CHECK (row_number > 0),
  sku            text,
  action         import_action,
  error_message  text,
  raw_json       jsonb NOT NULL,
  applied_at     timestamptz,
  UNIQUE (import_run_id, row_number)
);

COMMENT ON TABLE public.import_runs
  IS 'One row per CSV upload. Aggregates success/error counts.';
COMMENT ON TABLE public.import_run_rows
  IS 'One row per CSV input row. action set during execution; error_message set on failure.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. ai_generations — every Claude call's audit row            │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE TABLE public.ai_generations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type         ai_task_type NOT NULL,
  entity_type       text NOT NULL,                       -- 'product', 'category', 'image', ...
  entity_id         uuid,
  prompt_version    text NOT NULL,
  model             text NOT NULL,                       -- 'claude-haiku-4-5', 'claude-sonnet-4-6', ...
  input_hash        text NOT NULL,                       -- sha256 of input payload
  input_tokens      int CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens     int CHECK (output_tokens IS NULL OR output_tokens >= 0),
  usd_cost          numeric(10, 6) CHECK (usd_cost IS NULL OR usd_cost >= 0),
  output_json       jsonb,
  validation_status text NOT NULL,                       -- 'ok' | 'rejected' | 'semantic_fail'
  validation_error  text,
  status            ai_generation_status NOT NULL DEFAULT 'proposed',
  reviewed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_generations
  IS 'Every Anthropic call logged: input_hash for cache lookup, output_json for replay, status for accept/reject audit.';
COMMENT ON COLUMN public.ai_generations.input_hash
  IS 'sha256 of the (model, prompt_version, normalized input) tuple. Drives the 24h cache lookup.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 6. publish-state trigger                                     │
-- ╰──────────────────────────────────────────────────────────────╯
-- Enforces invariants between products.review_status and products.is_published:
--   review_status='published'  ⟹ is_published=true
--   review_status='archived'   ⟹ is_published=false
-- The trigger REJECTS bad inputs; it does NOT auto-sync. Server-side code
-- must set both fields consistently. Hidden-bug avoidance.
CREATE OR REPLACE FUNCTION public.enforce_publish_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_status = 'published' AND NEW.is_published = false THEN
    RAISE EXCEPTION
      'products.review_status=''published'' requires is_published=true (got false). Update both fields together.';
  END IF;
  IF NEW.review_status = 'archived' AND NEW.is_published = true THEN
    RAISE EXCEPTION
      'products.review_status=''archived'' requires is_published=false (got true). Update both fields together.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_publish_state_consistency
  BEFORE INSERT OR UPDATE OF is_published, review_status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_publish_state();


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 7. Smoke block — trigger MUST reject both invariant breaks   │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  cat_id  uuid;
  prod_id uuid;
BEGIN
  INSERT INTO public.categories (slug, name)
  VALUES ('zzz-ops-smoke-cat', 'Ops smoke (transient)')
  RETURNING id INTO cat_id;

  -- (a) Insert with review_status='published' but is_published=false → must fail.
  BEGIN
    INSERT INTO public.products (sku, slug, name, category_id, review_status, is_published)
    VALUES ('ZZZ-OPS-PUB-NOT', 'zzz-ops-pub-not', 'Bad publish state',
            cat_id, 'published', false);
    RAISE EXCEPTION 'Smoke FAIL: published+is_published=false should have been rejected';
  EXCEPTION WHEN raise_exception THEN NULL; END;

  -- (b) Insert with review_status='archived' but is_published=true → must fail.
  BEGIN
    INSERT INTO public.products (sku, slug, name, category_id, review_status, is_published)
    VALUES ('ZZZ-OPS-ARCH-PUB', 'zzz-ops-arch-pub', 'Bad archive state',
            cat_id, 'archived', true);
    RAISE EXCEPTION 'Smoke FAIL: archived+is_published=true should have been rejected';
  EXCEPTION WHEN raise_exception THEN NULL; END;

  -- (c) Valid combinations all succeed.
  INSERT INTO public.products (sku, slug, name, category_id, review_status, is_published)
  VALUES ('ZZZ-OPS-DRAFT', 'zzz-ops-draft', 'Draft', cat_id, 'draft', false)
  RETURNING id INTO prod_id;

  -- Update to ready_to_publish without flipping is_published → must succeed.
  UPDATE public.products SET review_status = 'ready_to_publish' WHERE id = prod_id;

  -- Flip to published WITH is_published=true → must succeed.
  UPDATE public.products
  SET review_status = 'published', is_published = true
  WHERE id = prod_id;

  -- Flip to archived WITH is_published=false → must succeed.
  UPDATE public.products
  SET review_status = 'archived', is_published = false
  WHERE id = prod_id;

  -- (d) audit_logs accepts an insert
  INSERT INTO public.audit_logs (action, entity_type, entity_id, after_json)
  VALUES ('product.delete', 'product', prod_id, jsonb_build_object('sku', 'ZZZ-OPS-DRAFT'));

  -- (e) background_jobs accepts queued state
  INSERT INTO public.background_jobs (kind, status, payload_json)
  VALUES ('bulk_publish', 'queued', jsonb_build_object('ids', '[]'::jsonb));

  -- Cleanup
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;
  DELETE FROM public.audit_logs WHERE entity_id = prod_id;
  DELETE FROM public.background_jobs WHERE kind = 'bulk_publish' AND status = 'queued';

  IF EXISTS (SELECT 1 FROM public.products WHERE id = prod_id) THEN
    RAISE EXCEPTION 'Smoke cleanup left residue';
  END IF;
END $$;
