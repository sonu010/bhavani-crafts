# Runbook: Rotate secrets

**When to rotate:**
- Any secret was accidentally committed (immediately).
- Any secret was visible in a screenshot/screen-share (immediately).
- Routine annual rotation (every 12 months).
- Off-boarding a team member who had access.

## Supabase service-role key

1. Supabase dashboard → Project Settings → API → "Reveal" service-role key.
2. Click "Reset service-role key." Confirm.
3. **Immediately**:
   - Update Vercel env var `SUPABASE_SERVICE_ROLE_KEY` (all environments).
   - Trigger a redeploy.
   - Update `web/.env.local` for any local developer.
4. The old key is now revoked. Verify production with a `/admin` test.

## Supabase anon key

Rotating this requires updating both:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel (all environments).
- The same value in `web/.env.local`.
- Then redeploy.

Anon key is bundled into the client; old caches will continue using the old key until users refresh. Acceptable since the anon key only has RLS-public-select access.

## Anthropic API key

1. console.anthropic.com → API keys → revoke old key.
2. Generate new key.
3. Update Vercel env `ANTHROPIC_API_KEY`. Redeploy.
4. AI features briefly unavailable during redeploy. Acceptable.

## Resend API key

Similar to above — generate at resend.com, update Vercel, redeploy.

## Upstash Redis token

Similar pattern.

## When a secret was committed

1. **Do not** delete the commit hoping it goes away. Git history retains it.
2. Rotate the secret immediately (above).
3. Force-push only if the leaked commit is on a branch no one has pulled. Even then, treat the secret as compromised.
4. Add a Husky pre-commit hook check if not already present:
   ```bash
   # .husky/pre-commit
   if git diff --cached --name-only | grep -E '\.env(\..+)?$'; then
     echo "Refusing to commit .env files."
     exit 1
   fi
   ```

## Secrets we never put in CI logs

- Print env vars only when explicitly debugging, and mask with `***` in any output.
- GitHub Actions automatically masks secrets in logs if registered as encrypted secrets.
