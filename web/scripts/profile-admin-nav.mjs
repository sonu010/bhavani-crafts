#!/usr/bin/env node
/**
 * Profile a real dashboard → /admin/products navigation against a
 * running dev server. Creates a throwaway owner with TOTP enrolled,
 * navigates via fetch (preserving cookies), reports wall-clock times.
 *
 * Usage (in two terminals):
 *
 *   terminal 1:  cd web && pnpm dev
 *   terminal 2:  node scripts/profile-admin-nav.mjs
 *
 * The dev server's [perf] logs will print the server-side breakdown
 * for each request; this script reports the total round-trip from the
 * user's POV.
 */
import { createClient } from "@supabase/supabase-js";
import { generate as generateTotp } from "otplib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(here, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.DEV_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON || !SRV) {
  console.error("Missing Supabase env in web/.env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SRV, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── 1. Create throwaway owner ───────────────────────────────────
const email = `zzz-perf-${Math.random().toString(36).slice(2, 8)}@bhavani.test`;
const password = `zzz-pw-${Math.random().toString(36).slice(2, 12)}`;
console.log(`▶ creating throwaway owner ${email}`);
const create = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (create.error || !create.data.user) throw create.error ?? new Error("createUser failed");
const userId = create.data.user.id;
const { error: roleErr } = await admin
  .from("profiles")
  .update({ role: "owner" })
  .eq("id", userId);
if (roleErr) throw roleErr;

// ─── 2. Sign in + enroll TOTP via supabase-js ────────────────────
const userClient = createClient(SUPABASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false, flowType: "pkce" },
});
console.log("▶ signing in (password)");
const signIn = await userClient.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;
const session = signIn.data.session;
if (!session) throw new Error("no session");

console.log("▶ enrolling TOTP");
const enroll = await userClient.auth.mfa.enroll({ factorType: "totp" });
if (enroll.error) throw enroll.error;
const factorId = enroll.data.id;
const secret = enroll.data.totp.secret;

const challenge = await userClient.auth.mfa.challenge({ factorId });
if (challenge.error) throw challenge.error;
const code = await generateTotp({ secret });
const verify = await userClient.auth.mfa.verify({
  factorId,
  challengeId: challenge.data.id,
  code,
});
if (verify.error) throw verify.error;

// After verify, the session's access_token has aal=aal2.
const aal2Session = verify.data;
console.log(`  session now aal=${decodeJwt(aal2Session.access_token).aal}`);

// ─── 3. Build a single Supabase-SSR cookie that the proxy can read ─
//
// @supabase/ssr stores the session in a base64-encoded JSON cookie
// keyed `sb-<project-ref>-auth-token`. The cookie value is `base64-<b64>`
// (one chunk; multi-chunk variant exists but a single chunk works
// fine for our small session).
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const sessionJson = JSON.stringify({
  access_token: aal2Session.access_token,
  refresh_token: aal2Session.refresh_token,
  expires_at: aal2Session.expires_at,
  expires_in: aal2Session.expires_in,
  token_type: aal2Session.token_type,
  user: aal2Session.user,
});
const cookieValue = `base64-${Buffer.from(sessionJson, "utf8").toString("base64")}`;
const cookieName = `sb-${projectRef}-auth-token`;
const cookieHeader = `${cookieName}=${cookieValue}`;

// ─── 4. Fetch /admin and /admin/products, time them ──────────────
async function timed(label, urlPath) {
  const start = Date.now();
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  const ms = Date.now() - start;
  console.log(`  ${ms.toString().padStart(5)}ms  [${res.status}]  ${label}`);
  // Discard body (avoids holding the response open).
  await res.arrayBuffer().catch(() => undefined);
  return { ms, status: res.status };
}

console.log("\n▶ cold (first compile)");
await timed("/admin            ", "/admin");
await timed("/admin/products   ", "/admin/products");

console.log("\n▶ warm (compiled)");
await timed("/admin            ", "/admin");
await timed("/admin/products   ", "/admin/products");
await timed("/admin            ", "/admin");
await timed("/admin/products   ", "/admin/products");

// ─── 5. Cleanup ──────────────────────────────────────────────────
await admin.auth.admin.deleteUser(userId).catch(() => undefined);
console.log("\n▶ cleaned up");

function decodeJwt(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
