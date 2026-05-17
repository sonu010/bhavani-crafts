/**
 * Integration tests for recordAuthAttempt against live Supabase.
 *
 * audit_logs RLS is admin-only-select, service-role-insert. The helper
 * always uses the service-role client because the /login server action
 * runs while the user is unauthenticated.
 *
 * We exercise:
 *   - failure-path insert (actor_id NULL — no FK check)
 *   - success-path insert (actor_id is a real profiles.id — FK check)
 *   - that anon clients still can't read the rows back (RLS holds)
 */
import { afterAll, describe, expect, it } from "vitest";
import { ANONYMOUS_AUTH_ENTITY_ID, recordAuthAttempt } from "@/lib/auth/audit";
import { anon, srv } from "../db/_clients";

const FIXTURE_PREFIX = "zzz-fixture-";
const FIXTURE_DOMAIN = "bhavani.test";
const createdUserIds: string[] = [];
const insertedAuditIds: string[] = [];

afterAll(async () => {
  if (insertedAuditIds.length > 0) {
    await srv.from("audit_logs").delete().in("id", insertedAuditIds);
  }
  for (const id of createdUserIds) {
    await srv.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe("recordAuthAttempt", () => {
  it("inserts a failure row with NULL actor_id + sentinel entity_id, attempted email in after_json", async () => {
    const email = `${FIXTURE_PREFIX}badpw-${Math.random().toString(36).slice(2, 8)}@${FIXTURE_DOMAIN}`;
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

    await recordAuthAttempt(srv, {
      actorId: null,
      action: "auth.signin_failed",
      entityId: ANONYMOUS_AUTH_ENTITY_ID,
      afterJson: {
        ip: "127.0.0.1",
        attempted_email: email,
        reason: "invalid_credentials",
      },
      requestId,
    });

    const { data, error } = await srv
      .from("audit_logs")
      .select("id, actor_id, action, entity_type, entity_id, after_json, request_id")
      .eq("request_id", requestId)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      actor_id: null,
      action: "auth.signin_failed",
      entity_type: "session",
      entity_id: ANONYMOUS_AUTH_ENTITY_ID,
      request_id: requestId,
    });
    expect(data?.after_json).toMatchObject({
      attempted_email: email,
      reason: "invalid_credentials",
    });
    insertedAuditIds.push(data!.id);
  });

  it("inserts a success row with a real profile id (FK check passes)", async () => {
    const email = `${FIXTURE_PREFIX}ok-${Math.random().toString(36).slice(2, 8)}@${FIXTURE_DOMAIN}`;
    const { data: userRes } = await srv.auth.admin.createUser({
      email,
      password: "zzz-pw-test",
      email_confirm: true,
    });
    const userId = userRes.user!.id;
    createdUserIds.push(userId);
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

    await recordAuthAttempt(srv, {
      actorId: userId,
      action: "auth.signin",
      entityId: userId,
      afterJson: { ip: "127.0.0.1", mfa_level: "aal1" },
      requestId,
    });

    const { data, error } = await srv
      .from("audit_logs")
      .select("id, actor_id, action, entity_id, after_json")
      .eq("request_id", requestId)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      actor_id: userId,
      action: "auth.signin",
      entity_id: userId,
    });
    expect(data?.after_json).toMatchObject({ mfa_level: "aal1" });
    insertedAuditIds.push(data!.id);
  });

  it("the resulting row is invisible to anon (RLS holds)", async () => {
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;
    await recordAuthAttempt(srv, {
      actorId: null,
      action: "auth.signin_failed",
      entityId: ANONYMOUS_AUTH_ENTITY_ID,
      afterJson: {
        attempted_email: `${FIXTURE_PREFIX}rls-${Math.random().toString(36).slice(2, 8)}@${FIXTURE_DOMAIN}`,
      },
      requestId,
    });

    const { data: srvSee } = await srv
      .from("audit_logs")
      .select("id")
      .eq("request_id", requestId)
      .single();
    insertedAuditIds.push(srvSee!.id);

    const { data: anonSee } = await anon
      .from("audit_logs")
      .select("id")
      .eq("request_id", requestId);
    expect(anonSee ?? []).toHaveLength(0);
  });

  it("throws if the insert fails (no silent swallow)", async () => {
    // Build a deliberately-invalid actor_id (UUID format but no row).
    const fakeActor = "00000000-0000-0000-0000-000000000001";
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

    await expect(
      recordAuthAttempt(srv, {
        actorId: fakeActor,
        action: "auth.signin",
        entityId: fakeActor,
        afterJson: null,
        requestId,
      }),
    ).rejects.toThrow(/recordAuthAttempt|insert failed/i);
  });
});
