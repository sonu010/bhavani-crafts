-- ─────────────────────────────────────────────────────────────────────
-- 0016_order_items_anon_insert_fix.sql
--
-- 0015 shipped a broken `order_items_anon_insert` policy: the WITH
-- CHECK clause contains `EXISTS (SELECT 1 FROM public.orders ...)`,
-- but that subquery runs as the current role (anon). Anon has NO
-- SELECT policy on orders (PII gate), so the EXISTS subquery sees
-- zero rows, and every anon order_items INSERT fails — even for an
-- order anon just created in the previous request.
--
-- Caught by `__tests__/db/orders-rls.test.ts` test #5.
--
-- Fix: wrap the parent-lookup in a SECURITY DEFINER function that
-- runs with the owner's privileges and is granted EXECUTE to anon.
-- The function does the narrow "is this order id a still-pending,
-- anon-owned order?" check only — it does NOT return the row, so
-- it does not widen the PII surface.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.is_pending_anon_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.status = 'pending_payment'
      and o.user_id is null
      and o.deleted_at is null
  );
$$;

comment on function public.is_pending_anon_order(uuid) is
  'RLS helper: true iff <order_id> is a still-pending anon-owned order. '
  'SECURITY DEFINER so the anon-insert policy on order_items can look '
  'past the orders PII gate. Returns boolean only — no row data leaks.';

revoke all on function public.is_pending_anon_order(uuid) from public;
-- Supabase-only roles. pglite (validate:migrations) does not create
-- `anon` / `authenticated` — guard the GRANT so the migration runs
-- in both environments.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.is_pending_anon_order(uuid) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.is_pending_anon_order(uuid) to authenticated';
  end if;
end;
$$;

-- Replace the broken policy.
drop policy if exists order_items_anon_insert on public.order_items;

create policy order_items_anon_insert on public.order_items
  for insert
  with check (public.is_pending_anon_order(order_id));

-- ─── Smoke block ─────────────────────────────────────────────────────
-- Schema-level only (pglite runs as superuser, RLS bypassed). We pin
-- the function's return shape + the boolean-only contract — the actual
-- anon-role probe is in __tests__/db/orders-rls.test.ts.
do $$
declare
  oid uuid;
begin
  insert into public.orders
    (customer_name, customer_email, customer_phone, shipping_address,
     subtotal_inr, shipping_inr, total_inr)
  values
    ('zzz Smoke 16', 'zzz-mig16@example.invalid', '0000000000',
     '{}'::jsonb, 1, 0, 1)
  returning id into oid;

  if not public.is_pending_anon_order(oid) then
    raise exception 'smoke FAILED: pending anon order should report true';
  end if;

  update public.orders set status = 'paid', paid_at = now() where id = oid;
  if public.is_pending_anon_order(oid) then
    raise exception 'smoke FAILED: paid order should NOT report pending';
  end if;

  if public.is_pending_anon_order(gen_random_uuid()) then
    raise exception 'smoke FAILED: unknown id should report false';
  end if;

  delete from public.orders where id = oid;
end;
$$ language plpgsql;
