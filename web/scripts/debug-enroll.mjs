#!/usr/bin/env node
/**
 * Diagnostic: drive the exact enroll path that /admin/2fa-setup walks,
 * printing every intermediate response so we can see what Supabase
 * actually returns vs what our page code expects.
 *
 * Usage:
 *   node scripts/debug-enroll.mjs                    # creates a throwaway user
 *   node scripts/debug-enroll.mjs <email>            # uses an existing user (must know its password)
 *   EMAIL=… PASSWORD=… node scripts/debug-enroll.mjs # explicit creds
 */
import { createClient } from "@supabase/supabase-js";
import { generate as generateTotp } from "otplib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local manually (this script doesn't go through Next).
const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(here, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SRV) {
  console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SERVICE_ROLE_KEY)");
  process.exit(1);
}

const admin = createClient(URL, SRV, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  let email = process.env.EMAIL ?? process.argv[2];
  let password = process.env.PASSWORD;
  let createdUserId;

  if (!email) {
    email = `zzz-debug-${Math.random().toString(36).slice(2, 8)}@bhavani.test`;
    password = `zzz-pw-${Math.random().toString(36).slice(2, 12)}`;
    console.log(`creating throwaway user ${email}`);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    createdUserId = data.user.id;
  } else if (!password) {
    throw new Error("Provide PASSWORD env when using an existing email");
  }

  const user = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`signing in as ${email}`);
  const { error: signInErr } = await user.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signInWithPassword: ${signInErr.message}`);

  console.log("\n--- BEFORE: listFactors ---");
  const before = await user.auth.mfa.listFactors();
  console.log(JSON.stringify(before, null, 2));

  console.log("\n--- AAL ---");
  const aal = await user.auth.mfa.getAuthenticatorAssuranceLevel();
  console.log(JSON.stringify(aal, null, 2));

  // Unenroll unverified leftovers (matches page logic).
  for (const f of before.data?.totp ?? []) {
    if (f.status !== "verified") {
      console.log(`\nunenrolling unverified factor ${f.id}`);
      const un = await user.auth.mfa.unenroll({ factorId: f.id });
      console.log(JSON.stringify(un, null, 2));
    }
  }

  console.log("\n--- ENROLL ---");
  const enroll = await user.auth.mfa.enroll({ factorType: "totp" });
  if (enroll.error) {
    console.log("ENROLL ERROR:", enroll.error);
    console.log("error code:", enroll.error.code);
    console.log("error status:", enroll.error.status);
    console.log("error name:", enroll.error.name);
  } else {
    const d = enroll.data;
    console.log({
      id: d.id,
      type: d.type,
      qr_code_length: d.totp?.qr_code?.length,
      qr_code_first80: d.totp?.qr_code?.slice(0, 80),
      qr_code_last40: d.totp?.qr_code?.slice(-40),
      secret_length: d.totp?.secret?.length,
      uri_first120: d.totp?.uri?.slice(0, 120),
    });
  }

  console.log("\n--- AFTER ENROLL: listFactors ---");
  const after = await user.auth.mfa.listFactors();
  console.log(JSON.stringify(after, null, 2));

  // Drive challenge + verify with the real TOTP code.
  if (enroll.data) {
    const secret = enroll.data.totp.secret;
    const code = await generateTotp({ secret });
    console.log(`\n--- CHALLENGE + VERIFY (code=${code}) ---`);
    const ch = await user.auth.mfa.challenge({ factorId: enroll.data.id });
    console.log("challenge:", ch);
    if (ch.data) {
      const v = await user.auth.mfa.verify({
        factorId: enroll.data.id,
        challengeId: ch.data.id,
        code,
      });
      console.log("verify:", v);
    }

    console.log("\n--- AAL after verify ---");
    const aal2 = await user.auth.mfa.getAuthenticatorAssuranceLevel();
    console.log(JSON.stringify(aal2, null, 2));

    console.log("\n--- listFactors after verify ---");
    const final = await user.auth.mfa.listFactors();
    console.log(JSON.stringify(final, null, 2));
  }

  if (createdUserId) {
    console.log(`\ncleaning up throwaway user ${createdUserId}`);
    await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
  } else {
    console.log("\n(skipping cleanup — used existing user)");
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
