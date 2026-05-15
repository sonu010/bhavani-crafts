# Runbook: Deploy to Vercel

## First deploy

1. **Create the GitHub repo** (owner action):
   ```bash
   gh repo create bhavani-crafts --private --source=. --description "Bhavani Crafts e-commerce"
   git remote add origin git@github.com:<owner>/bhavani-crafts.git
   git branch -M main
   git push -u origin main
   ```

2. **Import on Vercel:**
   - Go to vercel.com → "Add New… → Project"
   - Select the `bhavani-crafts` repo
   - Framework preset: Next.js
   - Root directory: `web`
   - Build command: `pnpm build`
   - Output directory: leave default
   - Install command: `pnpm install`

3. **Environment variables** (paste in Vercel dashboard, all environments):

   ```
   NEXT_PUBLIC_SUPABASE_URL          = <supabase project url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY     = <supabase anon key>
   SUPABASE_SERVICE_ROLE_KEY         = <supabase service role key>
   AI_MONTHLY_USD_BUDGET             = 20
   ANTHROPIC_API_KEY                 = <only when AI features ship>
   SENTRY_DSN                        = <only when Sentry wired>
   UPSTASH_REDIS_REST_URL            = <only when rate limits wired>
   UPSTASH_REDIS_REST_TOKEN          = <only when rate limits wired>
   ```

4. **Deploy:**
   - Click "Deploy."
   - Confirm the production URL loads `/` (placeholder page is fine pre-Phase 3).

## Subsequent deploys

- Push to `main` → Vercel auto-deploys to production.
- Push to any other branch → Vercel auto-deploys a preview URL.
- PR comments include the preview URL.

## Rollback

If a deploy breaks production:
- Vercel dashboard → Deployments → find the last good deployment → click "..." → "Promote to Production"
- Then `git revert <bad-commit>` and push a fix.

## Custom domain (post-launch)

- Vercel dashboard → Settings → Domains → Add `bhavanicrafts.in`
- Vercel gives DNS records to add at the registrar (CNAME or A).
- HTTPS provisioned automatically (Let's Encrypt).
- Set `bhavanicrafts.in` as the production domain.

## Build failures

- Run `pnpm build` locally first; reproduce the error.
- Common causes:
  - Missing env var → check Vercel project settings.
  - TypeScript error → `pnpm tsc --noEmit` to surface.
  - ESLint error → `pnpm lint` to surface.
  - Outdated lockfile → commit the updated `pnpm-lock.yaml`.

## Don't do this

- Never disable CI checks to force a merge.
- Never commit `.env.local`. The pre-commit hook blocks it; if you bypassed the hook, immediately rotate the keys.
