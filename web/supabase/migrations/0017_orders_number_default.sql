-- ─────────────────────────────────────────────────────────────────────
-- 0017_orders_number_default.sql
--
-- 0015 set up `orders.order_number` as NOT NULL with no DEFAULT, and
-- filled it via a BEFORE INSERT trigger. Functionally correct, but
-- PostgREST's type generator sees the column as REQUIRED on insert
-- (it doesn't introspect triggers), so client callers that omit the
-- column fail at typecheck time.
--
-- Fix: promote the trigger logic to a true column DEFAULT calling
-- `public.generate_order_number()`. PostgREST now exposes the column
-- as optional, and `types.gen.ts` follows. The trigger's role is now
-- narrowed to `updated_at` housekeeping (and remains for the special
-- case where a caller wants to override the default — the trigger
-- only fills the column when NULL).
--
-- No data change. Backward-compatible — existing rows keep their
-- order_number.
-- ─────────────────────────────────────────────────────────────────────

alter table public.orders
  alter column order_number set default public.generate_order_number();

-- Smoke: omitting order_number on insert must now succeed, and the
-- minted value must match the BC-YYYY-NNNN regex.
do $$
declare
  oid uuid;
  num text;
begin
  insert into public.orders
    (customer_name, customer_email, customer_phone, shipping_address,
     subtotal_inr, shipping_inr, total_inr)
  values
    ('zzz Smoke 17', 'zzz-mig17@example.invalid', '0000000000',
     '{}'::jsonb, 1, 0, 1)
  returning id, order_number into oid, num;

  if num is null or num !~ '^BC-[0-9]{4}-[0-9]{4,}$' then
    raise exception 'smoke FAILED: column DEFAULT did not mint a valid order_number (got %)', num;
  end if;

  delete from public.orders where id = oid;
end;
$$ language plpgsql;
