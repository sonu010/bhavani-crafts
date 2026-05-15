# 📋 Next steps for you — Vercel + Supabase

The `rebuild-v2` branch is now on GitHub. Vercel will try to preview-build it but **will fail** until you do **Step 1** below, because the project's "Root Directory" still points at the repo root from the old layout.

This guide walks you through:
1. **Vercel — Root Directory + env vars** (do this first)
2. **Supabase — region check + CLI login** (do this when convenient)
3. **What I'll do next** (no waiting required from you)

---

## Step 1 — Vercel: Root Directory + env vars

### 1.1 Change "Root Directory"

1. Open https://vercel.com/dashboard and select the `bhavani-crafts` project.
2. **Settings → Build & Development Settings → Root Directory**
3. Click "Edit." Currently it's `./` (or similar). Change to:

   ```
   web
   ```

4. **Important:** check the box **"Include source files outside of the Root Directory in the Build Step"** (or whatever Vercel calls it now — there's a toggle for "include files outside root" if it's there; if there's no such toggle, leave the default).
5. Save.

**What this changes:** all future Vercel builds (preview + production) will treat `web/` as the Next.js project and ignore the rest of the repo (`claude/`, `user/`, `scripts/`, etc.). The currently-live production deployment of `main` keeps serving from cache — Vercel does not auto-rebuild old commits when you change settings. The legacy site stays up.

### 1.2 Add Environment Variables

**Settings → Environment Variables** → add these three. **Apply each to all three environments (Production, Preview, Development)** unless noted.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lyycugadkxjtevmugqol.supabase.co` | Public — fine to leak |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (the `anon public` JWT you shared earlier) | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | (the `service_role` JWT you shared earlier) | **Sensitive.** Apply to Preview + Production only (NOT Development — Vercel doesn't run "Development" anyway; this just prevents accidental download via `vercel env pull`). |

If you've forgotten the values, they're in your Supabase dashboard at **Project Settings → API**. They're identical to the values now sitting in your local `web/.env.local`.

### 1.3 Trigger a fresh preview build

After Root Directory + env vars are saved:
1. Vercel dashboard → **Deployments**
2. Find the failed `rebuild-v2` deploy at the top (it'll have a red "Failed" badge)
3. Click "..." → **Redeploy**
4. Wait ~90 seconds. The preview should build clean and serve at a URL like `https://bhavani-crafts-<hash>-<your-org>.vercel.app/`

### 1.4 Verify the preview

Open the preview URL. You should see:

- **`/`** — the Phase-0 placeholder ("Bhavani _Crafts_" in Newsreader serif italic on cream background, two phase chips below)
- **`/api/health`** — `{"ok":true,"db":"connected","note":"schema empty"}` (proves your env vars work in Vercel)
- **`/design`** — should **404 in the production build** (this route is dev-only-gated). If you see the design gallery here, the gating broke; tell me.

The legacy site at `https://bhavani-crafts.vercel.app/` (and your custom domain if any) should still serve the old prototype — untouched.

---

## Step 2 — Supabase: region check + (later) CLI login

### 2.1 Confirm region

1. Supabase dashboard → your project → **Project Settings → General**.
2. Look at "Region." If it says **Asia South (Mumbai)** or similar, perfect — lowest latency for Indian customers.
3. If it's somewhere else (US East, EU West, …), that's still fine for MVP. We can't change the region without recreating the project. Note for later: if performance matters, we can migrate to Mumbai in Phase 5.

### 2.2 (Optional, can wait) Save the database password

If you didn't save it when you created the project, **Project Settings → Database → Reset database password** lets you set a new one. You won't need it day-to-day (the API keys are what we use), but you'll need it for:
- Direct `psql` connections (rare — emergency only)
- Setting up the GitHub Actions backup job in Phase 5

Store it in a password manager. Not in any file.

### 2.3 You do NOT need to:

- Install the Supabase CLI locally yet — I'll do that when we run our first migration in P1-T01
- Run any SQL queries yet — schema lands in Phase 1
- Pre-create any tables — migrations will do it

---

## Step 3 — What I'll do next (no waiting)

Independent of Steps 1–2:

- **P0-T11** — wire security headers (CSP, HSTS, X-Frame-Options, etc.) into `next.config.ts` and add `images.remotePatterns` for Supabase Storage + the Just Kraft CDN. Commit to `rebuild-v2`.
- **P0-T03** (was deferred) — port the legacy cart Zustand store from `web-legacy/`. Actually, since we have no `web-legacy/` anymore (legacy lives on origin/main), I'll either fetch the file from `origin/main` or rewrite a cleaner version. Decision logged when I land it.

When you complete Steps 1.1–1.4, ping me and I'll move on to **P1-T01** — the first Postgres migration. That's the moment your Supabase database stops being empty.

---

## TL;DR Action Checklist

Tick these off as you go:

- [ ] Vercel: Root Directory → `web` (Step 1.1)
- [ ] Vercel: Add `NEXT_PUBLIC_SUPABASE_URL` env (Step 1.2)
- [ ] Vercel: Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` env
- [ ] Vercel: Add `SUPABASE_SERVICE_ROLE_KEY` env (Preview + Production only)
- [ ] Vercel: Redeploy `rebuild-v2` (Step 1.3)
- [ ] Vercel: Verify `/` + `/api/health` on the preview URL (Step 1.4)
- [ ] Supabase: confirm region (Step 2.1)
- [ ] Supabase: save the DB password (Step 2.2, optional but recommended)
- [ ] **Ping me** when above are done — I'll start P1-T01 (first migration)

The legacy site stays live at `bhavani-crafts.vercel.app` the whole time. We're not touching production until you say so.
