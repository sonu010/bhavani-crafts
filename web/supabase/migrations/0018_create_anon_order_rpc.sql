-- ─────────────────────────────────────────────────────────────────────
-- 0018_create_anon_order_rpc.sql
--
-- Anon-friendly order-creation RPC for the checkout server action
-- (P3-T26 / T27).
--
-- The orders RLS (0015) allows anon to INSERT a `pending_payment`
-- order but DENIES anon SELECT (PII gate). PostgREST's `.insert().select()`
-- chain — and Supabase JS's `.insert(...).select("id")` — requires
-- SELECT permission on the returning row, so the server action's
-- normal path can't read back the generated id and order_number.
--
-- Options considered:
--   (a) Add an anon-SELECT-own-row policy — needs a session identifier
--       we don't have (anon by definition).
--   (b) Use service-role from the server action — bypasses RLS entirely,
--       widens the trust surface, blocked by no-restricted-imports.
--   (c) SECURITY DEFINER RPC that returns the (id, order_number) pair
--       after a controlled insert. This.
--
-- The RPC re-applies all the same WITH CHECK constraints the policy
-- enforces (status='pending_payment', user_id NULL, no razorpay refs),
-- and limits the inputs to plain owner-facing data. It does NOT take
-- a `status` argument — that's hard-coded to `pending_payment`. The
-- only paths that flip status are admin via service-role + the
-- verify endpoint (T28) which uses the keyed signature, not this RPC.
--
-- Mirrors the SECURITY DEFINER pattern already in 0016
-- (`is_pending_anon_order`).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.create_anon_order(
  p_customer_name  text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping       jsonb,
  p_subtotal_inr   integer,
  p_shipping_inr   integer,
  p_total_inr      integer,
  p_notes          text,
  -- jsonb array of {product_id, variant_id, sku, name, variant_label,
  -- unit_price_inr, quantity, line_total_inr}
  p_items          jsonb
)
returns table (id uuid, order_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
begin
  -- Defensive re-checks. The policy enforces these too, but doing
  -- them in the function gives the caller a clearer error message.
  if p_subtotal_inr < 0 or p_shipping_inr < 0 or p_total_inr < 0 then
    raise exception 'create_anon_order: negative totals (subtotal=% shipping=% total=%)',
      p_subtotal_inr, p_shipping_inr, p_total_inr
      using errcode = '22023';
  end if;
  if p_total_inr <> p_subtotal_inr + p_shipping_inr then
    raise exception 'create_anon_order: totals do not balance (% != % + %)',
      p_total_inr, p_subtotal_inr, p_shipping_inr
      using errcode = '23514';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'create_anon_order: at least one item required'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'create_anon_order: max 50 items per order'
      using errcode = '22023';
  end if;

  -- Insert the order row. status, user_id, razorpay_* all default to
  -- the safe values; the trigger fills updated_at; the column DEFAULT
  -- mints order_number.
  insert into public.orders
    (customer_name, customer_email, customer_phone,
     shipping_address, subtotal_inr, shipping_inr, total_inr, notes)
  values
    (p_customer_name, p_customer_email, p_customer_phone,
     p_shipping, p_subtotal_inr, p_shipping_inr, p_total_inr,
     nullif(p_notes, ''))
  returning orders.id, orders.order_number
    into v_order_id, v_order_number;

  -- Insert each item. Build the row from the jsonb element, casting
  -- columns explicitly so a malformed input fails fast.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items
      (order_id, product_id, variant_id, sku, name, variant_label,
       unit_price_inr, quantity, line_total_inr)
    values
      (v_order_id,
       nullif(v_item ->> 'product_id', '')::uuid,
       nullif(v_item ->> 'variant_id', '')::uuid,
       v_item ->> 'sku',
       v_item ->> 'name',
       nullif(v_item ->> 'variant_label', ''),
       (v_item ->> 'unit_price_inr')::integer,
       (v_item ->> 'quantity')::integer,
       (v_item ->> 'line_total_inr')::integer);
  end loop;

  return query select v_order_id, v_order_number;
end;
$$;

comment on function public.create_anon_order(text, text, text, jsonb, integer, integer, integer, text, jsonb) is
  'Anon-friendly checkout: inserts a pending_payment order + its items '
  'and returns the new id + order_number. SECURITY DEFINER so it can '
  'read back past the PII-gating orders RLS. See ADR-011.';

-- Lock down + grant only to anon + authenticated.
revoke all on function public.create_anon_order(text, text, text, jsonb, integer, integer, integer, text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.create_anon_order(text, text, text, jsonb, integer, integer, integer, text, jsonb) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.create_anon_order(text, text, text, jsonb, integer, integer, integer, text, jsonb) to authenticated';
  end if;
end;
$$;

-- ─── Smoke block ────────────────────────────────────────────────────
do $$
declare
  r record;
  bad boolean := false;
begin
  -- Happy path.
  select * into r from public.create_anon_order(
    'zzz RPC',
    'zzz-mig18@example.invalid',
    '0000000000',
    '{"line1":"X","city":"H","state":"TG","pin":"500001","country":"IN"}'::jsonb,
    300, 50, 350, null,
    '[{"product_id":null,"variant_id":null,"sku":"ZZZ-1","name":"zzz","variant_label":null,"unit_price_inr":300,"quantity":1,"line_total_inr":300}]'::jsonb
  );
  if r.id is null or r.order_number !~ '^BC-[0-9]{4}-[0-9]{4,}$' then
    raise exception 'smoke FAILED: RPC happy path returned bad id/order_number';
  end if;

  -- Totals balance check.
  begin
    perform public.create_anon_order(
      'zzz', 'zzz-mig18bad@example.invalid', '0', '{}'::jsonb,
      100, 0, 999, null,
      '[{"product_id":null,"variant_id":null,"sku":"ZZZ","name":"zzz","variant_label":null,"unit_price_inr":100,"quantity":1,"line_total_inr":100}]'::jsonb
    );
    bad := true;
  exception when others then
    null;
  end;
  if bad then
    raise exception 'smoke FAILED: imbalanced totals should have been rejected';
  end if;

  -- Cleanup.
  delete from public.orders where customer_email like 'zzz-mig18%@example.invalid';
end;
$$ language plpgsql;
