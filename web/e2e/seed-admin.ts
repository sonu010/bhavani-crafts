/**
 * E2E seed — ensure the TOTP test admin exists on the LOCAL stack.
 *
 * Run after `supabase db reset`, before the Playwright run:
 *   pnpm e2e:seed
 *
 * Steps (service-role against the local Auth server):
 *   1. Create (or reuse) the test admin user, email-confirmed.
 *   2. Promote its profile to role='owner' (the on_auth_user_created
 *      trigger inserts the profiles row at 'viewer').
 *   3. Sign in + enroll a TOTP factor, then challenge + verify it once
 *      so the factor is VERIFIED (login can then re-challenge it).
 *   4. Write the factor secret to e2e/.auth/totp-secret.txt for the
 *      browser auth setup to generate fresh codes.
 *
 * Mirrors web/__tests__/auth/mfa-enroll.test.ts (the proven flow).
 *
 * SAFETY: refuses to run unless NEXT_PUBLIC_SUPABASE_URL points at a
 * local address (127.0.0.1 / localhost). Never seed a real project.
 */
import { createClient } from "@supabase/supabase-js";
import { generate as generateTotp } from "otplib";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { TEST_ADMIN, TOTP_SECRET_FILE } from "./constants";

// Load e2e/.env.e2e (this runs outside Playwright, so it can't rely on
// the config's env load).
const envFile = path.join(process.cwd(), "e2e", ".env.e2e");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(
    `Refusing to seed: NEXT_PUBLIC_SUPABASE_URL is "${url}", not a local stack.\n` +
      `E2E must run against a local Supabase (supabase start). See e2e/README.md.`,
  );
  process.exit(1);
}
if (!serviceKey || !anonKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY (e2e/.env.e2e).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(): Promise<string> {
  // Look for an existing user by listing (local stack is small).
  const list = await admin.auth.admin.listUsers();
  if (list.error) throw list.error;
  const existing = list.data.users.find((u) => u.email === TEST_ADMIN.email);
  if (existing) return existing.id;

  const created = await admin.auth.admin.createUser({
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("createUser returned no user");
  }
  return created.data.user.id;
}

async function main() {
  const userId = await ensureUser();

  // Promote to owner so the admin gate (requireRole) passes.
  const promote = await admin
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", userId);
  if (promote.error) throw new Error(`promote: ${promote.error.message}`);

  // Sign in as the user to manage its own MFA factors.
  const user = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await user.auth.signInWithPassword({
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
  });
  if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);

  // If a verified TOTP factor already exists we can't read its secret
  // back, so unenroll any existing factors and re-enroll fresh.
  const factors = await user.auth.mfa.listFactors();
  for (const f of factors.data?.all ?? []) {
    await user.auth.mfa.unenroll({ factorId: f.id });
  }

  // Enroll with a UNIQUE friendlyName. Re-running the seed without a
  // `supabase db reset` can leave an unverified factor named "" that
  // listFactors().all doesn't return (so the unenroll loop above misses
  // it), which makes a default re-enroll fail with mfa_factor_name_conflict.
  // A unique name sidesteps the conflict; login verifies the newest factor.
  const enroll = await user.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `e2e-${Date.now()}`,
  });
  if (enroll.error || !enroll.data) throw enroll.error ?? new Error("enroll failed");
  const factorId = enroll.data.id;
  const secret = enroll.data.totp.secret;

  const challenge = await user.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw challenge.error ?? new Error("challenge failed");

  const code = await generateTotp({ secret });
  const verify = await user.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) throw new Error(`verify: ${verify.error.message}`);

  mkdirSync(path.dirname(TOTP_SECRET_FILE), { recursive: true });
  writeFileSync(TOTP_SECRET_FILE, secret, "utf8");

  console.log(`✔ Seeded E2E admin ${TEST_ADMIN.email} (role=owner, TOTP verified).`);
  console.log(`  Secret written to ${TOTP_SECRET_FILE}`);
}

main().catch((err) => {
  console.error("E2E seed failed:", err);
  process.exit(1);
});
