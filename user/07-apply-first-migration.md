# 📋 Apply migration 0001_init.sql

The first migration is written and committed. It creates 4 enums, 2 helper functions, 3 tables (`profiles`, `categories`, `products`), and an auto-create-profile trigger on `auth.users`.

**Two paths to apply it.** Pick one — both end at the same place.

---

## Path A — Supabase SQL Editor (fastest, 30 seconds)

1. Open https://supabase.com/dashboard → your project (`lyycugadkxjtevmugqol`) → **SQL Editor** (left sidebar).
2. Click **+ New query**.
3. Copy the entire file `web/supabase/migrations/0001_init.sql` and paste into the editor.
   - On GitHub: https://github.com/sonu010/bhavani-crafts/blob/rebuild-v2/web/supabase/migrations/0001_init.sql
   - Locally: open in your editor and `Cmd+A`, `Cmd+C`.
4. Click **Run** (green button, top right). Should take 2–3 seconds.
5. Confirm success — you should see "Success. No rows returned" in the result pane.
6. Ping me in chat: **"migration applied"** and I'll verify + move on.

### How to verify it worked

In the same SQL Editor, run this:

```sql
SELECT
  (SELECT count(*) FROM pg_type WHERE typname IN ('profile_role','stock_status','product_source','review_status')) AS enums,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('profiles','categories','products')) AS tables,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('profiles_set_updated_at','categories_set_updated_at','products_set_updated_at','on_auth_user_created')) AS triggers;
```

Expected: `enums=4, tables=3, triggers=4`.

---

## Path B — Supabase CLI (one-time setup, then automatic from now on)

This is the path I'll use for every future migration if you set it up now. Takes ~2 minutes one-time.

1. In your terminal:
   ```bash
   cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts/web"
   pnpm dlx supabase@latest login
   ```
   A browser opens. Click "Authorize." Done.

2. Then:
   ```bash
   pnpm dlx supabase@latest link --project-ref lyycugadkxjtevmugqol
   ```
   You'll be asked for the **database password**. Enter the one you set when creating the Supabase project. If you don't remember it, **Project Settings → Database → Reset database password** to set a new one, then use that.

3. Then push the migration:
   ```bash
   pnpm dlx supabase@latest db push
   ```
   You'll see `0001_init.sql` listed and a confirmation prompt. Type `y` + Enter.

4. Ping me: **"migration pushed via CLI"** and I'll verify + take it from here.

**Once Path B is set up, every future migration applies with just `pnpm dlx supabase@latest db push` — no manual paste-into-editor.**

---

## What's in this migration (review before applying)

```
4 enums:
  profile_role     owner | admin | editor | viewer
  stock_status     in_stock | low_stock | out_of_stock | made_to_order | unknown
  product_source   manual | justkraft_seed | csv_import | ai_assisted
  review_status    draft | needs_review | ready_to_publish | published | archived

2 helper functions:
  public.set_updated_at()   bumps updated_at on every UPDATE
  public.is_admin()          returns true if caller is owner/admin/editor

3 tables:
  public.profiles    1:1 with auth.users, sources admin roles
  public.categories  tree, globally unique slugs, soft-delete
  public.products    catalog, 30+ columns, soft-delete, audit columns

1 auth trigger:
  on_auth_user_created  auto-creates a viewer-role profile when someone signs up

3 updated_at triggers (profiles, categories, products)
```

**What's deliberately NOT in this migration:**
- RLS policies (separate migration in P1-T06 so we can test the schema first)
- Attributes / variants / images / tags (separate migrations 0002–0003)
- Search indexes (0005)
- Ops tables / publish-state trigger (0004)
- Catalog indexes / category_with_descendants view (0007)

The migration ends with a smoke insert/delete that fails the migration loudly if anything is structurally broken. So when you see "Success," the schema is provably usable.

---

## After it's applied

I'll:
1. Verify schema via the type-gen check + a quick query through the `/api/health` route (now expanded to read from `categories`).
2. Promote your Supabase user to `owner` role (you'll need to have signed up via the app at least once — but that's optional until P2-T02).
3. Move on to **P1-T02** (attribute_definitions + product_attributes), **P1-T03** (variants + images + tags), etc.

No action from you between migrations once Path B is set up.

---

## TL;DR

**Easiest:** Path A — paste into SQL Editor, click Run, tell me "applied."

**Best long-term:** Path B — `supabase login` once, then everything is automatic.

Either way, **the legacy site at bhavani-crafts.vercel.app is untouched.** Your database starts as empty schema; we add data later via the seed script and your real product entries.
