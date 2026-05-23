/**
 * Integration tests for the audit-log reader (P2-T26).
 *
 * The viewer is read-only over a table that's already populated by
 * every prior task's actions; the tests insert their own zzz- rows
 * via service-role to isolate from existing data.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  getAuditLog,
  listAuditLogs,
  listDistinctActions,
  listDistinctEntityTypes,
} from "@/lib/db/admin/audit";
import { srv } from "../_clients";

const auditIds: string[] = [];

afterAll(async () => {
  if (auditIds.length > 0) {
    await srv.from("audit_logs").delete().in("id", auditIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeAudit(opts: {
  action: string;
  entity_type: string;
  before?: unknown;
  after?: unknown;
  createdAt?: string;
}) {
  const { data, error } = await srv
    .from("audit_logs")
    .insert({
      actor_id: null,
      action: opts.action,
      entity_type: opts.entity_type,
      entity_id: "00000000-0000-0000-0000-000000000000",
      before_json: (opts.before ?? null) as never,
      after_json: (opts.after ?? null) as never,
      request_id: rid(),
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  auditIds.push(data.id);
  return data;
}

describe("listAuditLogs", () => {
  it("filters by action", async () => {
    const tag = `zzz.audit-list-${rid()}`;
    const a = await makeAudit({ action: tag, entity_type: "zzz" });
    await makeAudit({ action: `other-${tag}`, entity_type: "zzz" });

    const r = await listAuditLogs(srv, { action: tag }, null);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((row) => row.action === tag)).toBe(true);
    expect(r.rows.find((row) => row.id === a.id)).toBeDefined();
  });

  it("filters by entity_type", async () => {
    const et = `zzz_et_${rid()}`;
    const a = await makeAudit({ action: "zzz.et", entity_type: et });
    const r = await listAuditLogs(srv, { entityType: et }, null);
    expect(r.rows.find((row) => row.id === a.id)).toBeDefined();
    expect(r.rows.every((row) => row.entity_type === et)).toBe(true);
  });

  it("paginates: cursor returns older rows only", async () => {
    const tag = `zzz.audit-page-${rid()}`;
    // Insert 3 with descending timestamps; cursor on row #1 returns
    // #2 and #3.
    const a = await makeAudit({
      action: tag,
      entity_type: "zzz",
      createdAt: "2026-01-03T00:00:00Z",
    });
    const b = await makeAudit({
      action: tag,
      entity_type: "zzz",
      createdAt: "2026-01-02T00:00:00Z",
    });
    const c = await makeAudit({
      action: tag,
      entity_type: "zzz",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const page1 = await listAuditLogs(srv, { action: tag }, null);
    expect(page1.rows[0]?.id).toBe(a.id);

    const page2 = await listAuditLogs(
      srv,
      { action: tag },
      { created_at: a.created_at, id: a.id },
    );
    const ids = page2.rows.map((r) => r.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(a.id);
  });
});

describe("getAuditLog", () => {
  it("returns null for missing id", async () => {
    const r = await getAuditLog(
      srv,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r).toBeNull();
  });

  it("returns the row with before/after payloads", async () => {
    const a = await makeAudit({
      action: `zzz.get-${rid()}`,
      entity_type: "zzz",
      before: { x: 1 },
      after: { x: 2 },
    });
    const r = await getAuditLog(srv, a.id);
    expect(r).not.toBeNull();
    expect(r?.before_json).toEqual({ x: 1 });
    expect(r?.after_json).toEqual({ x: 2 });
  });
});

describe("listDistinctActions / listDistinctEntityTypes", () => {
  it("includes inserted action verbs", async () => {
    const tag = `zzz.distinct-${rid()}`;
    await makeAudit({ action: tag, entity_type: `zzz_ent_${rid()}` });
    const actions = await listDistinctActions(srv);
    expect(actions).toContain(tag);
  });

  it("returns entity types", async () => {
    const et = `zzz_dist_et_${rid()}`;
    await makeAudit({ action: "zzz.et2", entity_type: et });
    const ets = await listDistinctEntityTypes(srv);
    expect(ets).toContain(et);
  });
});
