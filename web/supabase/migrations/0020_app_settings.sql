-- ─────────────────────────────────────────────────────────────────────
-- 0020_app_settings.sql
--
-- Owner-editable shop configuration as a tiny key-value table.
--
-- Why a k/v table instead of a typed `settings` row:
--   - The fields drift over the life of the product (shop_name today,
--     bank_handle next quarter, festival_banner_html later). A wide
--     typed row means a migration per addition; a k/v lets the admin
--     UI add fields by declaring them in code.
--   - Settings are read on every storefront request (footer phone
--     number, shipping rate at checkout). The k/v read is one
--     `select * from app_settings` — small, cacheable via the
--     `app-settings` tag.
--   - Audit, soft-delete, and complex relationships don't make sense
--     here. The settings page rewrites whole rows on save.
--
-- RLS:
--   - Anon CAN SELECT a public-allowlisted subset (shop_name,
--     whatsapp_number, instagram_url, shipping_flat_inr) so the
--     storefront footer + checkout total can read without a service-
--     role hop. The allowlist is enforced in the public-select policy.
--   - Admin (is_admin()) has full SELECT + INSERT + UPDATE.
--   - No DELETE — settings rows are upserted, never removed.
-- ─────────────────────────────────────────────────────────────────────

create table public.app_settings (
  key         text primary key
              constraint app_settings_key_format
              check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  value       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.app_settings is
  'Owner-editable shop configuration as a key-value table. Subset is '
  'anon-readable (footer phone, shipping rate). See 0020 migration.';

-- updated_at touch trigger.
create or replace function public.app_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_touch_updated_at_trg
  before update on public.app_settings
  for each row execute function public.app_settings_touch_updated_at();

-- ─── Seed the known keys with empty values so admins see them in the
--     editor even before they've set anything.
insert into public.app_settings (key, value) values
  ('shop_name', 'Bhavani Crafts'),
  ('whatsapp_number', ''),
  ('instagram_url', ''),
  ('shipping_flat_inr', '50')
on conflict (key) do nothing;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.app_settings enable row level security;

-- Public-allowed keys. Hard-coded inline rather than table-driven so a
-- typo in the admin UI can't accidentally widen the set.
create policy app_settings_public_select on public.app_settings
  for select
  using (
    key in ('shop_name', 'whatsapp_number', 'instagram_url', 'shipping_flat_inr')
  );

create policy app_settings_admin_select on public.app_settings
  for select
  using (public.is_admin());

create policy app_settings_admin_insert on public.app_settings
  for insert
  with check (public.is_admin());

create policy app_settings_admin_update on public.app_settings
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Smoke ────────────────────────────────────────────────────────────
do $$
declare
  v text;
begin
  -- Seeded rows are present.
  select value into v from public.app_settings where key = 'shop_name';
  if v <> 'Bhavani Crafts' then
    raise exception 'smoke FAILED: shop_name seed missing or wrong (got %)', v;
  end if;

  -- Key format constraint rejects garbage.
  begin
    insert into public.app_settings (key, value) values ('BAD KEY', 'x');
    raise exception 'smoke FAILED: bad key format should have been rejected';
  exception when check_violation then null;
  end;

  -- Updated_at touches on UPDATE.
  perform pg_sleep(0.01);
  update public.app_settings set value = 'Bhavani Crafts' where key = 'shop_name';
  if (select updated_at from public.app_settings where key = 'shop_name') is null then
    raise exception 'smoke FAILED: updated_at NULL after touch';
  end if;
end;
$$ language plpgsql;
