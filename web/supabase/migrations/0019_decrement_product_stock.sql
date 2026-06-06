-- ─────────────────────────────────────────────────────────────────────
-- 0019_decrement_product_stock.sql
--
-- Best-effort stock decrement RPC, called from the admin
-- `markOrderPaid` action (ADR-011 §5 "Inventory is reserved on paid").
--
-- Why an RPC instead of an inline UPDATE on the call site:
--   - We want the read + write atomic (`set stock_quantity =
--     greatest(0, stock_quantity - $by)`). Supabase JS's
--     `.update()` builder can't express that.
--   - We want to silently no-op when stock_quantity IS NULL — those
--     products opt out of tracking. The RPC encodes that policy in
--     ONE place so the rule can't drift across callers.
--   - We want to clamp to 0 rather than allow negatives. Over-sells
--     are reconciled manually (ADR-011 §5 "stock is informational at
--     MVP"); we don't want them visible as -3 either.
--
-- Returns the new stock_quantity (or NULL when the row opted out).
-- Admin-only — gated by ESLint admin import rule on the call site.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.decrement_product_stock(
  p_product_id uuid,
  p_quantity   integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  new_qty integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'decrement_product_stock: quantity must be positive (got %)', p_quantity
      using errcode = '22023';
  end if;

  update public.products
     set stock_quantity = greatest(0, stock_quantity - p_quantity)
   where id = p_product_id
     and stock_quantity is not null
     and deleted_at is null
   returning stock_quantity into new_qty;

  return new_qty;
end;
$$;

comment on function public.decrement_product_stock(uuid, integer) is
  'Best-effort stock decrement on paid orders. Returns the new stock_quantity '
  'or NULL when the row opted out of tracking. See ADR-011 §5.';

revoke all on function public.decrement_product_stock(uuid, integer) from public;
-- The function is SECURITY DEFINER so it can update past the products
-- admin-write RLS; we still narrow EXECUTE so it's not anon-callable.
-- The admin path (lib/db/admin.ts) uses service-role and bypasses
-- this anyway, but the explicit revoke keeps the principle of least
-- privilege from the grant side.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.decrement_product_stock(uuid, integer) to service_role';
  end if;
end;
$$;

-- ─── Smoke ───────────────────────────────────────────────────────────
do $$
declare
  cat_id uuid;
  prod_tracked uuid;
  prod_untracked uuid;
  res integer;
begin
  insert into public.categories (slug, name)
  values ('zzz-mig19-cat', 'zzz cat')
  returning id into cat_id;

  insert into public.products (
    sku, slug, name, base_price_inr, stock_status, stock_quantity,
    category_id, is_published, review_status, source
  ) values (
    'ZZZ-MIG19-T', 'zzz-mig19-tracked', 'zzz tracked', 100,
    'in_stock', 10, cat_id, true, 'published', 'manual'
  ) returning id into prod_tracked;

  insert into public.products (
    sku, slug, name, base_price_inr, stock_status, stock_quantity,
    category_id, is_published, review_status, source
  ) values (
    'ZZZ-MIG19-U', 'zzz-mig19-untracked', 'zzz untracked', 100,
    'in_stock', null, cat_id, true, 'published', 'manual'
  ) returning id into prod_untracked;

  -- Tracked: 10 → 7
  res := public.decrement_product_stock(prod_tracked, 3);
  if res <> 7 then raise exception 'smoke FAILED: tracked got %, want 7', res; end if;

  -- Untracked: null → null
  res := public.decrement_product_stock(prod_untracked, 3);
  if res is not null then raise exception 'smoke FAILED: untracked got %, want null', res; end if;

  -- Tracked clamp: 7 - 100 → 0
  res := public.decrement_product_stock(prod_tracked, 100);
  if res <> 0 then raise exception 'smoke FAILED: clamp got %, want 0', res; end if;

  -- Bad quantity rejected.
  begin
    res := public.decrement_product_stock(prod_tracked, 0);
    raise exception 'smoke FAILED: 0 qty should reject';
  exception when others then null;
  end;

  delete from public.products where id in (prod_tracked, prod_untracked);
  delete from public.categories where id = cat_id;
end;
$$ language plpgsql;
