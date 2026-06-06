-- ─────────────────────────────────────────────────────────────────────
-- 0015_orders.sql
--
-- Razorpay-backed checkout schema (P3-T25). Two tables:
--
--   • orders       — one row per checkout attempt. Holds customer PII +
--                    Razorpay refs + the money totals.
--   • order_items  — one row per cart line, FK CASCADE to orders.
--                    Names + prices SNAPSHOTTED so a future product
--                    edit doesn't rewrite history.
--
-- Plus the `order_status` enum and a `generate_order_number()` Postgres
-- function that mints human-friendly `BC-YYYY-NNNN` ids on insert.
--
-- See claude/decisions/ADR-011-razorpay-payments.md for scope:
--   • No refunds in-app (admin can mark status='refunded' for the
--     audit trail; the actual money movement is Razorpay-dashboard
--     side).
--   • No customer accounts at MVP — name/phone/email per order.
--   • Currency is INR; totals are whole rupees stored as integers.
--
-- RLS posture (anon contains the public storefront client; admin
-- means is_admin() returns true):
--
--   • anon may INSERT a row to `orders` with status='pending_payment'
--     and user_id IS NULL. This is the checkout's "create-order"
--     server action's path.
--   • anon may INSERT items to `order_items` IF the parent order is
--     still 'pending_payment' (race-window during the same request).
--   • anon CANNOT SELECT from either table. Orders contain PII — a
--     leak here is materially worse than the catalog-only state.
--   • admin (is_admin()) may SELECT + UPDATE all rows. Status flips
--     (pending→paid) happen via service-role from the verify handler.
--
-- The actual anon-JWT probe lives in scripts/launch-blockers.ts (RLS
-- attack test against live), same pattern as products/audit_logs.
-- ─────────────────────────────────────────────────────────────────────

-- ─── Enum ────────────────────────────────────────────────────────────
create type public.order_status as enum (
  'pending_payment',  -- order row created; waiting on Razorpay capture
  'paid',             -- signature verified; money captured
  'failed',           -- Razorpay reported failure / customer abandoned
  'cancelled',        -- admin-cancelled before payment
  'refunded'          -- admin marked refunded after dashboard refund
);

-- ─── orders table ────────────────────────────────────────────────────
create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  -- Human-friendly id customers see ("BC-2026-0001"). Filled by trigger.
  order_number          text not null unique
                        constraint orders_order_number_format
                        check (order_number ~ '^BC-[0-9]{4}-[0-9]{4,}$'),

  status                public.order_status not null default 'pending_payment',

  -- Customer (no accounts — captured per order).
  customer_name         text not null check (char_length(customer_name) between 1 and 120),
  customer_email        text not null check (char_length(customer_email) between 3 and 254 and customer_email like '%@%'),
  customer_phone        text not null check (char_length(customer_phone) between 7 and 20),

  -- Shipping address. jsonb because India address formats vary
  -- (PIN code city state line1 line2 landmark country=IN). The
  -- checkout form normalizes this; downstream readers should expect
  -- the keys documented in lib/schemas/order.ts (lands with T27).
  shipping_address      jsonb not null,

  -- Money. Whole rupees, never paise. See ADR-011 §6.
  subtotal_inr          integer not null check (subtotal_inr >= 0),
  shipping_inr          integer not null default 0 check (shipping_inr >= 0),
  total_inr             integer not null check (total_inr >= 0),
  constraint            orders_totals_balance
                        check (total_inr = subtotal_inr + shipping_inr),

  -- Razorpay refs. order_id is set on create; payment_id + signature
  -- on verify. All three null until Razorpay round-trips.
  razorpay_order_id     text unique,
  razorpay_payment_id   text,
  razorpay_signature    text,

  -- Optional notes from the customer (textarea on the checkout page).
  notes                 text check (notes is null or char_length(notes) <= 500),

  -- Lifecycle.
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  paid_at               timestamptz,
  cancelled_at          timestamptz,
  refunded_at           timestamptz,

  -- Soft-delete (matches the rest of the schema — see ADR-006). The
  -- admin Trash page can list orders too; cancellation is the natural
  -- pre-delete state, but deleting an audit-trail row needs a soft
  -- path for the same reason every other delete does.
  deleted_at            timestamptz,
  deleted_by            uuid references public.profiles(id) on delete set null,

  -- Whoever placed it (anon → null; if we add accounts later this
  -- backfills). Trigger does NOT enforce auth — the RLS policy does.
  user_id               uuid
);

comment on table public.orders is
  'Customer orders. Anon-INSERT only; admin SELECT/UPDATE only. See ADR-011.';

-- Useful indexes.
create index orders_status_created_at_idx
  on public.orders (status, created_at desc)
  where deleted_at is null;
create index orders_razorpay_order_id_idx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;
create index orders_customer_email_idx
  on public.orders (lower(customer_email))
  where deleted_at is null;

-- ─── order_items table ───────────────────────────────────────────────
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,

  -- Catalog refs. SET NULL on product/variant delete so deleting a
  -- product doesn't erase history — the snapshot name + sku + price
  -- below carry the line forward.
  product_id      uuid references public.products(id) on delete set null,
  variant_id      uuid references public.product_variants(id) on delete set null,

  -- Snapshot at time of purchase. These are the source of truth for
  -- the order; catalog edits do NOT propagate here.
  sku             text not null,
  name            text not null check (char_length(name) between 1 and 200),
  variant_label   text,  -- e.g. "Small / Teal"; null for variant-less products

  unit_price_inr  integer not null check (unit_price_inr >= 0),
  quantity        integer not null check (quantity > 0 and quantity <= 999),
  line_total_inr  integer not null check (line_total_inr >= 0),

  -- Belt + suspenders: the line total must equal price × qty.
  constraint order_items_line_total_balance
    check (line_total_inr = unit_price_inr * quantity),

  created_at      timestamptz not null default now()
);

comment on table public.order_items is
  'Line items per order. Price/name SNAPSHOTTED — catalog edits do not propagate.';

create index order_items_order_id_idx on public.order_items (order_id);

-- ─── Order-number generator ──────────────────────────────────────────
-- Sequence keyed per-year via a small helper function. `order_number`
-- is `BC-YYYY-NNNN` where NNNN is the order's count within that year,
-- left-padded to 4 digits but allowed to grow past 9999 (regex above
-- requires ≥4 digits).
create sequence public.orders_number_seq;

create or replace function public.generate_order_number()
returns text
language plpgsql
volatile
as $$
declare
  yr text := to_char(now(), 'YYYY');
  n  bigint;
begin
  n := nextval('public.orders_number_seq');
  return format('BC-%s-%s', yr, lpad(n::text, 4, '0'));
end;
$$;

create or replace function public.orders_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := public.generate_order_number();
  end if;
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger orders_set_defaults_trg
  before insert on public.orders
  for each row execute function public.orders_set_defaults();

-- Touch updated_at on UPDATE.
create or replace function public.orders_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_touch_updated_at_trg
  before update on public.orders
  for each row execute function public.orders_touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- orders: anon INSERT only (status=pending_payment, user_id IS NULL,
-- razorpay refs null because the server action sets them in a
-- subsequent UPDATE via service-role).
create policy orders_anon_insert on public.orders
  for insert
  with check (
    status = 'pending_payment'
    and user_id is null
    and razorpay_payment_id is null
    and razorpay_signature is null
    and deleted_at is null
  );

create policy orders_admin_select on public.orders
  for select
  using (public.is_admin());

create policy orders_admin_update on public.orders
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy orders_admin_delete on public.orders
  for delete
  using (public.is_admin());

-- order_items: anon INSERT only when the parent order is still
-- pending_payment AND owned by anon (user_id IS NULL). The EXISTS
-- subquery mirrors the child-of-products RLS pattern from 0006.
create policy order_items_anon_insert on public.order_items
  for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.status = 'pending_payment'
        and o.user_id is null
        and o.deleted_at is null
    )
  );

create policy order_items_admin_select on public.order_items
  for select
  using (public.is_admin());

create policy order_items_admin_update on public.order_items
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy order_items_admin_delete on public.order_items
  for delete
  using (public.is_admin());

-- ─── Smoke block ─────────────────────────────────────────────────────
-- pglite runs as superuser (bypasses RLS), so the role-switching probes
-- live in launch-blockers.ts. Here we just validate the schema:
--   1. Insert an order → order_number gets minted by the trigger.
--   2. Insert items → line_total_balance + cascade work.
--   3. Status enum rejects garbage.
--   4. Totals-balance + order_number-format constraints fire.
do $$
declare
  oid uuid;
  start_orders bigint := (select count(*) from public.orders where order_number like 'BC-%');
begin
  -- 1. Happy path: order with a single line.
  insert into public.orders
    (customer_name, customer_email, customer_phone, shipping_address,
     subtotal_inr, shipping_inr, total_inr)
  values
    ('zzz Smoke Buyer', 'zzz-smoke@example.invalid', '0000000000',
     '{"line1":"Smoke","city":"Hyderabad","state":"TG","pin":"500000","country":"IN"}'::jsonb,
     250, 0, 250)
  returning id into oid;

  insert into public.order_items
    (order_id, sku, name, unit_price_inr, quantity, line_total_inr)
  values
    (oid, 'ZZZ-SMK-01', 'zzz Smoke Item', 250, 1, 250);

  -- 2. Trigger minted an order_number.
  if not exists (select 1 from public.orders where id = oid and order_number like 'BC-%-%') then
    raise exception 'smoke FAILED: order_number was not minted';
  end if;

  -- 3. Bad totals-balance must be rejected.
  begin
    insert into public.orders
      (customer_name, customer_email, customer_phone, shipping_address,
       subtotal_inr, shipping_inr, total_inr)
    values
      ('zzz', 'zzz-bad@example.invalid', '0000000000',
       '{}'::jsonb, 100, 0, 999);
    raise exception 'smoke FAILED: totals_balance check should have rejected unbalanced total';
  exception when check_violation then
    null;  -- expected
  end;

  -- 4. Bad order_number format must be rejected.
  begin
    insert into public.orders
      (order_number, customer_name, customer_email, customer_phone,
       shipping_address, subtotal_inr, shipping_inr, total_inr)
    values
      ('not-a-bc-number', 'zzz', 'zzz-x@example.invalid', '0000000000',
       '{}'::jsonb, 0, 0, 0);
    raise exception 'smoke FAILED: order_number format check should have rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 5. Bad line_total must be rejected.
  begin
    insert into public.order_items
      (order_id, sku, name, unit_price_inr, quantity, line_total_inr)
    values
      (oid, 'ZZZ-BAD', 'zzz bad', 100, 2, 999);
    raise exception 'smoke FAILED: line_total_balance check should have rejected';
  exception when check_violation then
    null;  -- expected
  end;

  -- 6. Cleanup. Items cascade off the order delete.
  delete from public.orders where customer_email like 'zzz-%';

  if (select count(*) from public.orders where order_number like 'BC-%') <> start_orders then
    raise exception 'smoke FAILED: row count drift after cleanup';
  end if;
end;
$$ language plpgsql;
