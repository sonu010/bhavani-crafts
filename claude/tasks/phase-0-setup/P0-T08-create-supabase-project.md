---
id: P0-T08
phase: 0
title: Create Supabase project + wire env
status: not_started
depends_on: [P0-T04]
estimate_hours: 0.5
owner: shared
last_updated: 2026-05-15
---

# Goal

After this task, a Supabase project exists, the CLI is linked to it locally, and `web/.env.local` has all three credentials.

# Prerequisites (read first)

- claude/architecture/auth-and-roles.md
- claude/architecture/security.md (secret isolation)

# Files to touch

- `web/.env.local` (new — gitignored)
- `web/.env.example` (new — committed, documents required vars)
- `web/supabase/config.toml` (created by `supabase init`)

# Implementation notes

**Owner action required**: create the Supabase project at supabase.com. AI cannot do this — pause and ask owner to:

1. Sign in to supabase.com.
2. "New Project" → Name: `bhavani-crafts` → Region: closest (e.g. Asia South / Mumbai) → Database password: save in 1Password.
3. Wait for provisioning (~2 min).
4. From Project Settings → API, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never paste in any client code)
   - **Project ref** → `<ref>` (short string; used by CLI)

Then resume:

```bash
cd web
pnpm dlx supabase@latest login
pnpm dlx supabase@latest init   # creates web/supabase/config.toml
pnpm dlx supabase@latest link --project-ref <ref>
```

Write `web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Write `web/.env.example`:
```
# Public (browser bundle)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Server-only — never expose to the browser bundle
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI features (Phase 4)
ANTHROPIC_API_KEY=
AI_MONTHLY_USD_BUDGET=20

# Observability (when wired)
SENTRY_DSN=

# Rate limiting (when wired)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

# Acceptance criteria

- [ ] Supabase project created (owner confirms via dashboard screenshot).
- [ ] `web/.env.local` exists with all 3 Supabase keys.
- [ ] `web/.env.example` exists with placeholders.
- [ ] `supabase link --project-ref <ref>` succeeded.
- [ ] `pnpm dlx supabase status` shows the project linked.

# Verification

```bash
cd web
test -f .env.local && echo "OK: env.local exists"
grep -q "NEXT_PUBLIC_SUPABASE_URL=https://" .env.local && echo "OK: url set"
grep -q "SUPABASE_SERVICE_ROLE_KEY=eyJ" .env.local && echo "OK: service-role set"
pnpm dlx supabase status
```

# Dependencies added

`supabase` (CLI, runtime). Installed via `pnpm dlx` so it's not in package.json — fine for one-off CLI tools.

# Notes for next agent

- The owner provided credentials at <timestamp>; document the project ref here.
- (filled in when status → done)
