/**
 * Integration test for the TOTP enrollment + verification flow against
 * live Supabase. Pins the Supabase MFA API shapes we depend on in
 * /admin/2fa-setup and /auth/verify-2fa.
 *
 * The contract we verify:
 *   1. mfa.enroll({ factorType: 'totp' }) returns a *complete* data: URI
 *      in `totp.qr_code` (NOT a raw SVG that needs prefixing).
 *   2. After enroll, the factor is in listFactors().all but NOT in
 *      .totp — `.totp` only contains *verified* factors.
 *   3. After challenge + verify with a valid code, the factor migrates
 *      into `.totp`, AAL upgrades to aal2, and requireAAL2 stops throwing.
 */
import { createClient } from "@supabase/supabase-js";
import { generate as generateTotp } from "otplib";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types.gen";
import { requireAAL2 } from "@/lib/auth/require";
import { MFANotVerifiedError } from "@/lib/auth/errors";
import { srv } from "../db/_clients";

const FIXTURE_PREFIX = "zzz-fixture-mfa-";
const FIXTURE_DOMAIN = "bhavani.test";
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await srv.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

async function makeSignedInUser() {
  const email = `${FIXTURE_PREFIX}${Math.random().toString(36).slice(2, 8)}@${FIXTURE_DOMAIN}`;
  const password = `zzz-pw-${Math.random().toString(36).slice(2, 12)}`;
  const { data: userRes, error: createErr } = await srv.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !userRes.user) throw createErr ?? new Error("createUser returned no user");
  createdUserIds.push(userRes.user.id);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { userId: userRes.user.id, client };
}

describe("MFA TOTP enrollment", () => {
  it("enroll() returns a complete data: URI in totp.qr_code (no re-prefixing needed)", async () => {
    const { client } = await makeSignedInUser();
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(error).toBeNull();
    expect(data?.totp.qr_code).toMatch(/^data:image\/svg\+xml;utf-8,/);
    expect(data?.totp.secret).toMatch(/^[A-Z2-7]{16,}$/); // base32
  });

  it("after enroll, the factor lives in listFactors().all (factor_type=totp, status=unverified), NOT in .totp", async () => {
    const { client } = await makeSignedInUser();
    await client.auth.mfa.enroll({ factorType: "totp" });

    const { data: factors } = await client.auth.mfa.listFactors();
    expect(factors?.all).toHaveLength(1);
    expect(factors?.all[0]).toMatchObject({
      factor_type: "totp",
      status: "unverified",
    });
    expect(factors?.totp).toHaveLength(0); // .totp is verified-only
  });

  it("challenge + verify with the right code → factor verified → AAL upgrades to aal2 → requireAAL2 stops throwing", async () => {
    const { client } = await makeSignedInUser();
    const { data: enrollData } = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollData).toBeDefined();
    const factorId = enrollData!.id;
    const secret = enrollData!.totp.secret;

    const { data: challenge } = await client.auth.mfa.challenge({ factorId });
    expect(challenge).toBeDefined();

    const code = await generateTotp({ secret });
    const { error: verifyErr } = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge!.id,
      code,
    });
    expect(verifyErr).toBeNull();

    // AAL2 now
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal2");

    // requireAAL2 stops throwing
    await expect(requireAAL2(client)).resolves.toBeUndefined();

    // factor migrated into .totp (the verified-only list)
    const { data: factors } = await client.auth.mfa.listFactors();
    expect(factors?.totp).toHaveLength(1);
    expect(factors?.totp?.[0]).toMatchObject({ status: "verified", factor_type: "totp" });
  });

  it("unenroll() removes the factor from both .all and .totp", async () => {
    const { client } = await makeSignedInUser();
    const { data: enrollData } = await client.auth.mfa.enroll({ factorType: "totp" });
    const factorId = enrollData!.id;

    const { error: unenrollErr } = await client.auth.mfa.unenroll({ factorId });
    expect(unenrollErr).toBeNull();

    const { data: factors } = await client.auth.mfa.listFactors();
    expect(factors?.all).toHaveLength(0);
    expect(factors?.totp).toHaveLength(0);
  });

  it("requireAAL2 still throws MFANotVerifiedError on an AAL1 session that has only enrolled but never verified", async () => {
    const { client } = await makeSignedInUser();
    await client.auth.mfa.enroll({ factorType: "totp" });
    // No verify → session stays AAL1.
    await expect(requireAAL2(client)).rejects.toBeInstanceOf(MFANotVerifiedError);
  });
});
