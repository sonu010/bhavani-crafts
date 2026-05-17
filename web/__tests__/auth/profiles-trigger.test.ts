/**
 * Integration test: the on_auth_user_created trigger + profiles table contract.
 *
 * The profiles row is the source of truth for admin role checks. The
 * trigger from 0001_init.sql is the only thing that keeps it in sync with
 * auth.users. If the trigger silently no-ops (RLS misconfig, search-path
 * drift, function-signature change), a new sign-up gets a session but no
 * profile, and every downstream requireRole() throws 403.
 *
 * This test asserts:
 *   1. auth.admin.createUser → profiles row auto-creates with role='viewer'
 *   2. auth.admin.deleteUser → profiles row CASCADE-removed
 *   3. is_admin() returns false for viewer JWTs, true after promotion
 *
 * Fixtures use zzz-prefixed emails (see __tests__/db/_clients.ts conventions).
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types.gen";
import { srv } from "../db/_clients";

const FIXTURE_DOMAIN = "bhavani.test";
const FIXTURE_PREFIX = "zzz-fixture-";

function makeFixtureEmail() {
  const tag = Math.random().toString(36).slice(2, 10);
  return `${FIXTURE_PREFIX}${tag}@${FIXTURE_DOMAIN}`;
}

const createdUserIds: string[] = [];

afterAll(async () => {
  // Best-effort cleanup. Tests delete their own users, but a thrown
  // assertion can skip the cleanup path inside the test body; this catches
  // those stragglers so we don't leak fixtures into auth.users.
  for (const id of createdUserIds) {
    await srv.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("profiles auto-creation trigger", () => {
  it("creates a profiles row with role='viewer' when a new auth.users row is inserted", async () => {
    const email = makeFixtureEmail();

    const { data: userRes, error: createErr } = await srv.auth.admin.createUser({
      email,
      password: "test-password-not-actually-used",
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    expect(userRes.user).toBeDefined();
    const userId = userRes.user!.id;
    createdUserIds.push(userId);

    const { data: profile, error: selectErr } = await srv
      .from("profiles")
      .select("id, role, full_name, created_at")
      .eq("id", userId)
      .single();

    expect(selectErr).toBeNull();
    expect(profile).toMatchObject({
      id: userId,
      role: "viewer",
      full_name: null,
    });
    // created_at within the last 30 seconds (generous to absorb clock skew
    // between the test machine and the Supabase server).
    const ageMs = Date.now() - new Date(profile!.created_at).getTime();
    expect(ageMs).toBeLessThan(30_000);
  });

  it("cascades the profiles row when auth.users row is deleted", async () => {
    const email = makeFixtureEmail();
    const { data: userRes } = await srv.auth.admin.createUser({
      email,
      password: "test-password-not-actually-used",
      email_confirm: true,
    });
    const userId = userRes.user!.id;
    createdUserIds.push(userId);

    // Sanity: profile exists right after createUser.
    const before = await srv.from("profiles").select("id").eq("id", userId).maybeSingle();
    expect(before.data?.id).toBe(userId);

    const { error: deleteErr } = await srv.auth.admin.deleteUser(userId);
    expect(deleteErr).toBeNull();
    // Successful deletion — drop from our cleanup list so afterAll doesn't
    // hit a "user not found" path.
    createdUserIds.splice(createdUserIds.indexOf(userId), 1);

    const after = await srv.from("profiles").select("id").eq("id", userId).maybeSingle();
    expect(after.data).toBeNull();
  });

  it("is_admin() returns false for viewer JWTs and true after promotion to admin", async () => {
    const email = makeFixtureEmail();
    const password = `zzz-pw-${Math.random().toString(36).slice(2, 12)}`;

    const { data: userRes } = await srv.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    const userId = userRes.user!.id;
    createdUserIds.push(userId);

    // Build an anon-keyed client that bears this user's JWT.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const userClient = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
    expect(signInErr).toBeNull();

    // As viewer: is_admin() → false.
    const asViewer = await userClient.rpc("is_admin");
    expect(asViewer.error).toBeNull();
    expect(asViewer.data).toBe(false);

    // Promote via service-role.
    const promoteRes = await srv
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId)
      .select("id, role")
      .single();
    expect(promoteRes.error).toBeNull();
    expect(promoteRes.data?.role).toBe("admin");

    // As admin: is_admin() → true. The function is STABLE and
    // SECURITY DEFINER — within a fresh request (here: a fresh rpc call)
    // it re-reads profiles.role.
    const asAdmin = await userClient.rpc("is_admin");
    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data).toBe(true);

    // Clean up the test user's session before deleting them — keeps the
    // auth.refresh_tokens table tidy.
    await userClient.auth.signOut();
  });
});
