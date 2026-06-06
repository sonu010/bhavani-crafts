-- ─────────────────────────────────────────────────────────────────────
-- 0014_search_logs_anon_insert.sql
--
-- Allow anonymous storefront visitors to INSERT into `search_logs`.
--
-- Why: P3-T18 ships the storefront `/search` page. Every query (zero-
-- result included) must be logged so the admin dashboard's "zero-
-- result searches" widget has data. We deliberately do NOT use a
-- service-role server action for this: the ESLint rule in
-- eslint.config.mjs (correctly) forbids importing `@/lib/db/admin`
-- outside the admin namespaces, and the log is conceptually a
-- public-write op.
--
-- Security posture:
--   • INSERT only (anon already could not SELECT; the admin SELECT
--     policy from 0006 is untouched).
--   • CHECK constraint caps query length at 120 (mirrors the page's
--     MAX_QUERY_LEN) so a malicious actor can't bulk an enormous
--     payload through this surface.
--   • WITH CHECK forces `user_id IS NULL` so anon can't impersonate
--     anyone via this path. (Authenticated writes get user_id from a
--     server action when/if we wire one — out of scope for MVP.)
--   • Policy uses the project's existing convention: bare
--     `FOR INSERT WITH CHECK (...)` — role defaults to PUBLIC, and the
--     check expression itself does the gating. The actual anon-JWT
--     probe lives in scripts/launch-blockers.ts (runtime check
--     against live Supabase).
-- ─────────────────────────────────────────────────────────────────────

alter table public.search_logs
  add constraint search_logs_query_max_len
  check (char_length(query) <= 120);

create policy search_logs_public_insert
  on public.search_logs
  for insert
  with check (
    user_id is null
    and char_length(query) > 0
    and char_length(query) <= 120
  );

-- ─── Smoke block ──────────────────────────────────────────────────────
-- pglite runs as superuser, which bypasses RLS, so we can't directly
-- assert "anon can insert" here (that lives in launch-blockers.ts as a
-- live anon-JWT probe). What we CAN validate:
--   1. the CHECK constraint rejects a 121+ char query
--   2. the policy exists in pg_policies with the right shape
--   3. our happy-path insert still works
-- All inserted rows are removed by the trailing cleanup.
do $$
declare
  start_count bigint := (select count(*) from public.search_logs);
  long_q text := repeat('x', 121);
  policy_qual text;
begin
  -- 1. CHECK constraint should reject an over-long query.
  begin
    insert into public.search_logs (query, result_count)
      values (long_q, 0);
    raise exception 'smoke FAILED: 121-char query insert should have been rejected by CHECK';
  exception
    when check_violation then
      null; -- expected
  end;

  -- 2. Policy must exist with the user_id IS NULL clause.
  select with_check into policy_qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'search_logs'
      and policyname = 'search_logs_public_insert';
  if policy_qual is null then
    raise exception 'smoke FAILED: search_logs_public_insert policy not found';
  end if;
  if position('user_id IS NULL' in policy_qual) = 0 then
    raise exception 'smoke FAILED: policy is missing the user_id IS NULL gate. with_check = %', policy_qual;
  end if;

  -- 3. Happy-path insert succeeds.
  insert into public.search_logs (query, result_count)
    values ('zzz-search-log-smoke', 0);

  -- Cleanup.
  delete from public.search_logs where query like 'zzz-search-log-smoke%';

  if (select count(*) from public.search_logs) <> start_count then
    raise exception 'smoke FAILED: row count drift after cleanup';
  end if;
end;
$$ language plpgsql;
