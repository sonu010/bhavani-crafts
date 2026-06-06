-- ─────────────────────────────────────────────────────────────────────
-- LOCAL / TEST SEED — applied by `supabase db reset` after migrations.
--
-- NOT shipped to production: `supabase db push` applies migrations only,
-- never this file. This exists so the local test stack has a small,
-- deterministic catalog for:
--   • the data-layer integration suites (categories/products read paths
--     that assert "seeded data exists"), and
--   • the Playwright E2E + a real storefront/admin to click through.
--
-- Slugs deliberately avoid the `zzz-` prefix so the per-suite fixture
-- purge (purgeZzzFixtures) leaves this baseline catalog intact.
-- Fixed UUIDs keep it idempotent and referenceable from specs.
-- ─────────────────────────────────────────────────────────────────────

-- Top-level categories (2) + children under "Pooja Items" (2).
insert into categories (id, slug, name, description, parent_id, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'pooja-items', 'Pooja Items', 'Brass and clay essentials for daily worship.', null, 1),
  ('11111111-1111-4111-8111-000000000002', 'home-decor',  'Home Decor',  'Handcrafted pieces for the home.',            null, 2),
  ('11111111-1111-4111-8111-000000000011', 'diyas',            'Diyas',            'Oil lamps in brass and terracotta.', '11111111-1111-4111-8111-000000000001', 1),
  ('11111111-1111-4111-8111-000000000012', 'incense-holders',  'Incense Holders',  'Stands and holders for agarbatti.',  '11111111-1111-4111-8111-000000000001', 2)
on conflict (id) do nothing;

-- A third top-level category for the homepage "Workshop kits" row. The
-- kits-row section resolves products by this exact slug; without it the
-- section hides.
insert into categories (id, slug, name, description, parent_id, sort_order) values
  ('11111111-1111-4111-8111-000000000003', 'workshop-kits', 'Workshop Kits', 'All-in-one kits for a single class.', null, 3)
on conflict (id) do nothing;

-- A tag.
insert into tags (id, slug, name) values
  ('22222222-2222-4222-8222-000000000001', 'handmade', 'Handmade')
on conflict (id) do nothing;

-- Published products across the categories. is_published + review_status
-- set consistently so the enforce_publish_state trigger passes. Three are
-- is_featured=true so the hero + weekly-collection section render with data.
insert into products
  (id, sku, slug, name, short_description, base_price_inr, compare_at_price_inr, stock_status, category_id, is_published, is_featured, review_status, source)
values
  ('33333333-3333-4333-8333-000000000001', 'SEED-DIYA-01', 'brass-diya-small',       'Brass Diya (Small)',        'Hand-cast brass oil lamp, 2 inch.',        250,  null, 'in_stock', '11111111-1111-4111-8111-000000000011', true, true,  'published', 'manual'),
  ('33333333-3333-4333-8333-000000000002', 'SEED-DIYA-02', 'brass-diya-large',       'Brass Diya (Large)',        'Hand-cast brass oil lamp, 4 inch.',        480,  600,  'in_stock', '11111111-1111-4111-8111-000000000011', true, true,  'published', 'manual'),
  ('33333333-3333-4333-8333-000000000003', 'SEED-INC-01',  'ceramic-incense-holder', 'Ceramic Incense Holder',    'Glazed ceramic agarbatti stand.',          180,  null, 'low_stock', '11111111-1111-4111-8111-000000000012', true, false, 'published', 'manual'),
  ('33333333-3333-4333-8333-000000000004', 'SEED-DEC-01',  'wall-hanging-peacock',   'Peacock Wall Hanging',      'Hand-painted wooden peacock panel.',       1250, null, 'in_stock', '11111111-1111-4111-8111-000000000002',  true, true,  'published', 'manual'),
  ('33333333-3333-4333-8333-000000000005', 'SEED-DEC-02',  'terracotta-vase',        'Terracotta Vase',           'Wheel-thrown terracotta flower vase.',     640,  null, 'in_stock', '11111111-1111-4111-8111-000000000002',  true, false, 'published', 'manual'),
  -- Workshop kits (3 published) for the kits-row section.
  ('33333333-3333-4333-8333-000000000201', 'SEED-KIT-01',  'resin-coaster-kit',      'Resin Coaster Kit',         'Everything for a 6-coaster resin class.',  1450, null, 'in_stock', '11111111-1111-4111-8111-000000000003',  true, false, 'published', 'manual'),
  ('33333333-3333-4333-8333-000000000202', 'SEED-KIT-02',  'clay-diya-kit',          'Clay Diya Painting Kit',    'Unpainted diyas, paints, brushes.',        650,  null, 'in_stock', '11111111-1111-4111-8111-000000000003',  true, false, 'published', 'manual'),
  ('33333333-3333-4333-8333-000000000203', 'SEED-KIT-03',  'macrame-starter-kit',    'Macramé Starter Kit',       'Cord, ring, and a printed pattern.',       820,  null, 'in_stock', '11111111-1111-4111-8111-000000000003',  true, false, 'published', 'manual')
on conflict (id) do nothing;

-- Unpublished products in the review queue (3). The admin products list
-- defaults to ?status=needs_review, so these are what an admin sees first
-- and what the E2E edit flow operates on. RLS keeps them off the storefront.
insert into products
  (id, sku, slug, name, short_description, base_price_inr, stock_status, category_id, is_published, review_status, source)
values
  ('33333333-3333-4333-8333-000000000101', 'SEED-REV-01', 'unreviewed-brass-bell',   'Brass Temple Bell',      'Imported, awaiting review.', 320, 'in_stock', '11111111-1111-4111-8111-000000000011', false, 'needs_review', 'justkraft_seed'),
  ('33333333-3333-4333-8333-000000000102', 'SEED-REV-02', 'unreviewed-camphor-stand', 'Camphor Burner Stand',   'Imported, awaiting review.', 210, 'in_stock', '11111111-1111-4111-8111-000000000012', false, 'needs_review', 'justkraft_seed'),
  ('33333333-3333-4333-8333-000000000103', 'SEED-REV-03', 'unreviewed-wooden-tray',   'Carved Wooden Tray',     'Imported, awaiting review.', 890, 'in_stock', '11111111-1111-4111-8111-000000000002',  false, 'needs_review', 'justkraft_seed')
on conflict (id) do nothing;

-- One primary image per PUBLISHED product (placeholder URLs; never fetched in
-- tests). license_status='owned' so they satisfy the launch-blocker that every
-- published product must have a licensed image (owned/licensed/public_domain).
insert into product_images (id, product_id, url, alt, sort_order, license_status) values
  ('44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001', 'https://seed.local/brass-diya-small.jpg',       'Brass Diya (Small)',     0, 'owned'),
  ('44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000002', 'https://seed.local/brass-diya-large.jpg',       'Brass Diya (Large)',     0, 'owned'),
  ('44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000003', 'https://seed.local/ceramic-incense-holder.jpg', 'Ceramic Incense Holder', 0, 'owned'),
  ('44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000004', 'https://seed.local/wall-hanging-peacock.jpg',   'Peacock Wall Hanging',   0, 'owned'),
  ('44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000005', 'https://seed.local/terracotta-vase.jpg',        'Terracotta Vase',        0, 'owned'),
  ('44444444-4444-4444-8444-000000000201', '33333333-3333-4333-8333-000000000201', 'https://seed.local/resin-coaster-kit.jpg',      'Resin Coaster Kit',      0, 'owned'),
  ('44444444-4444-4444-8444-000000000202', '33333333-3333-4333-8333-000000000202', 'https://seed.local/clay-diya-kit.jpg',          'Clay Diya Painting Kit', 0, 'owned'),
  ('44444444-4444-4444-8444-000000000203', '33333333-3333-4333-8333-000000000203', 'https://seed.local/macrame-starter-kit.jpg',    'Macramé Starter Kit',    0, 'owned')
on conflict (id) do nothing;

-- ─── Variant-bearing product (exercises the PDP variant selector T15) ───
-- "Resin Coaster Set" in home-decor with Size (Small/Large) × Color
-- (Teal/Saffron) = 4 variants. Default = Small/Teal.
insert into products
  (id, sku, slug, name, short_description, base_price_inr, stock_status, category_id, is_published, is_featured, review_status, source)
values
  ('33333333-3333-4333-8333-000000000301', 'SEED-RES-01', 'resin-coaster-set', 'Resin Coaster Set', 'Hand-poured resin coasters; pick your size and color.', 950, 'in_stock', '11111111-1111-4111-8111-000000000002', true, false, 'published', 'manual')
on conflict (id) do nothing;

insert into product_images (id, product_id, url, alt, sort_order, license_status) values
  ('44444444-4444-4444-8444-000000000301', '33333333-3333-4333-8333-000000000301', 'https://seed.local/resin-coaster-set-1.jpg', 'Resin Coaster Set',         0, 'owned'),
  ('44444444-4444-4444-8444-000000000302', '33333333-3333-4333-8333-000000000301', 'https://seed.local/resin-coaster-set-2.jpg', 'Resin Coaster Set (back)', 1, 'owned')
on conflict (id) do nothing;

insert into product_options (id, product_id, name, sort_order) values
  ('55555555-5555-4555-8555-000000000001', '33333333-3333-4333-8333-000000000301', 'Size',  0),
  ('55555555-5555-4555-8555-000000000002', '33333333-3333-4333-8333-000000000301', 'Color', 1)
on conflict (id) do nothing;

insert into product_option_values (id, option_id, value, sort_order) values
  ('66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000001', 'Small',   0),
  ('66666666-6666-4666-8666-000000000002', '55555555-5555-4555-8555-000000000001', 'Large',   1),
  ('66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000002', 'Teal',    0),
  ('66666666-6666-4666-8666-000000000004', '55555555-5555-4555-8555-000000000002', 'Saffron', 1)
on conflict (id) do nothing;

insert into product_variants (id, product_id, sku, name, price_inr, stock_status, is_default, sort_order) values
  ('77777777-7777-4777-8777-000000000001', '33333333-3333-4333-8333-000000000301', 'SEED-RES-01-S-TEAL',    'Small / Teal',    950,  'in_stock',     true,  0),
  ('77777777-7777-4777-8777-000000000002', '33333333-3333-4333-8333-000000000301', 'SEED-RES-01-S-SAFFRON', 'Small / Saffron', 950,  'low_stock',    false, 1),
  ('77777777-7777-4777-8777-000000000003', '33333333-3333-4333-8333-000000000301', 'SEED-RES-01-L-TEAL',    'Large / Teal',    1300, 'in_stock',     false, 2),
  ('77777777-7777-4777-8777-000000000004', '33333333-3333-4333-8333-000000000301', 'SEED-RES-01-L-SAFFRON', 'Large / Saffron', 1300, 'out_of_stock', false, 3)
on conflict (id) do nothing;

insert into variant_option_values (variant_id, option_value_id) values
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001'),
  ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000003'),
  ('77777777-7777-4777-8777-000000000002', '66666666-6666-4666-8666-000000000001'),
  ('77777777-7777-4777-8777-000000000002', '66666666-6666-4666-8666-000000000004'),
  ('77777777-7777-4777-8777-000000000003', '66666666-6666-4666-8666-000000000002'),
  ('77777777-7777-4777-8777-000000000003', '66666666-6666-4666-8666-000000000003'),
  ('77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000002'),
  ('77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000004')
on conflict (variant_id, option_value_id) do nothing;

-- Tag a couple of products.
insert into product_tags (product_id, tag_id) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001'),
  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000001')
on conflict (product_id, tag_id) do nothing;
