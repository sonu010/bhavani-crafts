# ⚡ Action required — share Supabase credentials

You created a Supabase project. The AI needs three values from it to wire the backend. **Send these in chat (not email, not screenshots that might leak).**

## How to find them

1. Open your Supabase project at https://supabase.com/dashboard.
2. Click your project → **Project Settings** (gear icon, bottom left) → **API**.
3. You'll see four values. Send these three:

| Setting | What to send | Why |
|---|---|---|
| **Project URL** | `https://<yourproject>.supabase.co` | Public; safe to share anywhere |
| **Project API keys → anon public** | `eyJhbGciOiJI…` (long JWT) | Public; will be in browser bundle |
| **Project API keys → service_role secret** | `eyJhbGciOiJI…` (long JWT) | **Server-only.** Treat as a password |
| Database password | *Don't send.* You set it during project creation. | Not needed by the AI; you'll need it for runbooks |

4. Also send the **Project Reference** — the short string visible in the URL `https://supabase.com/dashboard/project/<this-bit>`. The Supabase CLI needs it for `supabase link --project-ref <ref>`.

## How to send

Paste the four values in chat in this format (copy and edit):

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
SUPABASE_PROJECT_REF=abcdefgh
```

## What the AI will do with them

1. Write them to `web/.env.local` (already gitignored — they will **never** be committed).
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel (only when we decide to deploy the rebuild — not yet).
3. Run `supabase link --project-ref <ref>` so the CLI can push migrations.
4. Wire three typed client factories (browser / server / admin) with the service-role key strictly server-only and lint-restricted.

## If a credential gets exposed

Don't panic. Rotation is one click:

1. Supabase dashboard → Project Settings → API → "Reset service-role key" or "Reset anon key."
2. Tell the AI. It will update `.env.local` and (if applicable) Vercel.
3. The old key dies the moment Supabase rotates it.

## Region note (one-time)

If you haven't already locked the project's region, **Asia South (Mumbai)** gives Bhavani Crafts the lowest latency for your customers in India. Cannot be changed after project creation, but no harm if you picked something else — performance won't be a problem at MVP scale.
