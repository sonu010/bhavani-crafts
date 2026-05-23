-- 0012_audit_indexes.sql — indexes for /admin/activity (P2-T26).
--
-- rollback:
--   DROP INDEX IF EXISTS audit_logs_created_at_id_idx;
--   DROP INDEX IF EXISTS audit_logs_entity_idx;
--   DROP INDEX IF EXISTS audit_logs_actor_idx;
--   DROP INDEX IF EXISTS audit_logs_action_idx;
--
-- What this migration contains:
--   4 indexes supporting the audit viewer's primary access patterns
--   Smoke block asserts the indexes are present
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- audit_logs is append-only and grows fast. The default access pattern
-- for /admin/activity is "newest first, optional filter". Without an
-- index on (created_at DESC, id DESC) the list page hits a sequential
-- scan as soon as the table grows past a few thousand rows. The other
-- three indexes back the entity/actor/action filter combinators.

CREATE INDEX audit_logs_created_at_id_idx
  ON public.audit_logs (created_at DESC, id DESC);

CREATE INDEX audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX audit_logs_actor_idx
  ON public.audit_logs (actor_id, created_at DESC);

CREATE INDEX audit_logs_action_idx
  ON public.audit_logs (action, created_at DESC);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ Smoke — all four indexes present                             │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  expected text[] := ARRAY[
    'audit_logs_created_at_id_idx',
    'audit_logs_entity_idx',
    'audit_logs_actor_idx',
    'audit_logs_action_idx'
  ];
  ix text;
  found int;
BEGIN
  FOREACH ix IN ARRAY expected LOOP
    SELECT count(*) INTO found
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ix;
    IF found <> 1 THEN
      RAISE EXCEPTION 'Smoke FAIL: index % missing (found %)', ix, found;
    END IF;
  END LOOP;
END $$;
