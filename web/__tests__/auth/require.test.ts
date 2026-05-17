/**
 * Integration test: getCurrentProfile + requireRole against live Supabase.
 *
 * requireAAL2 is exercised end-to-end in P2-T01 once the TOTP enrollment
 * flow lands; here we verify the function exists and rejects a session
 * that has no MFA factor.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types.gen";
import {
  ForbiddenError,
  MFANotVerifiedError,
  UnauthenticatedError,
  isAuthError,
} from "@/lib/auth/errors";
import {
  getCurrentProfile,
  requireAAL2,
  requireRole,
} from "@/lib/auth/require";
import { srv } from "../db/_clients";

const FIXTURE_DOMAIN = "bhavani.test";
const FIXTURE_PREFIX = "zzz-fixture-";

function makeFixtureEmail() {
  const tag = Math.random().toString(36).slice(2, 10);
  return `${FIXTURE_PREFIX}${tag}@${FIXTURE_DOMAIN}`;
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await srv.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

async function makeUser(role: "viewer" | "editor" | "admin" | "owner") {
  const email = makeFixtureEmail();
  const password = `zzz-pw-${Math.random().toString(36).slice(2, 12)}`;
  const { data: userRes, error: createErr } = await srv.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !userRes.user) {
    throw createErr ?? new Error("admin.createUser returned no user");
  }
  const userId = userRes.user.id;
  createdUserIds.push(userId);

  if (role !== "viewer") {
    const { error: roleErr } = await srv
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (roleErr) throw roleErr;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { userId, email, client };
}

describe("getCurrentProfile", () => {
  it("throws UnauthenticatedError for a client with no session", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anonNoSession = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await expect(getCurrentProfile(anonNoSession)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("returns user + profile for a signed-in viewer", async () => {
    const { userId, client } = await makeUser("viewer");
    const { user, profile } = await getCurrentProfile(client);
    expect(user.id).toBe(userId);
    expect(profile.role).toBe("viewer");
    expect(profile.id).toBe(userId);
  });
});

describe("requireRole", () => {
  it("passes when role meets or exceeds the requirement", async () => {
    const { client } = await makeUser("admin");
    const { profile } = await requireRole(client, "admin");
    expect(profile.role).toBe("admin");

    // owner satisfies admin
    const owner = await makeUser("owner");
    const ownerCheck = await requireRole(owner.client, "admin");
    expect(ownerCheck.profile.role).toBe("owner");
  });

  it("throws ForbiddenError when role is below the requirement", async () => {
    const { client } = await makeUser("viewer");

    let caught: unknown;
    try {
      await requireRole(client, "admin");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ForbiddenError);
    expect(isAuthError(caught)).toBe(true);
    expect((caught as ForbiddenError).status).toBe(403);
  });

  it("rejects unauthenticated requests with UnauthenticatedError, not Forbidden", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anonNoSession = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await expect(requireRole(anonNoSession, "viewer")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});

describe("requireAAL2", () => {
  it("throws MFANotVerifiedError for an AAL1 session (no MFA factor enrolled)", async () => {
    const { client } = await makeUser("admin");
    // Fresh signInWithPassword without TOTP step → AAL1.
    let caught: unknown;
    try {
      await requireAAL2(client);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MFANotVerifiedError);
    expect((caught as MFANotVerifiedError).redirectTo).toBe("/auth/verify-2fa");
  });

  // AAL2-success path is covered in __tests__/auth/mfa.test.ts once
  // P2-T01 ships the TOTP enrollment + verification flow.
});
