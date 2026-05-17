/**
 * Integration tests for the six dashboard queries.
 *
 * Goal is to pin shapes + invariants, NOT specific counts (the live DB
 * contains varying data). Where a count is required, we set up a
 * dedicated fixture and assert the delta.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  AI_BUDGET_USD_MTD,
  getAISpendMTD,
  getBrokenImagesCount,
  getCatalogCounts,
  getMutationsThisWeek,
  getZeroResultSearches,
  listRunningJobs,
} from "@/lib/db/admin/dashboard";
import { srv } from "../_clients";

const FIXTURE_PREFIX = "zzz-fixture-dash-";
const FIXTURE_REQUEST_ID = `zzz-fixture-dash-${Math.random().toString(36).slice(2, 10)}`;
const insertedAuditIds: string[] = [];
const insertedSearchLogIds: string[] = [];
const insertedJobIds: string[] = [];

afterAll(async () => {
  if (insertedAuditIds.length > 0) {
    await srv.from("audit_logs").delete().in("id", insertedAuditIds);
  }
  if (insertedSearchLogIds.length > 0) {
    await srv.from("search_logs").delete().in("id", insertedSearchLogIds);
  }
  if (insertedJobIds.length > 0) {
    await srv.from("background_jobs").delete().in("id", insertedJobIds);
  }
});

describe("getCatalogCounts", () => {
  it("returns four numeric fields, total ≥ published, all ≥ 0", async () => {
    const result = await getCatalogCounts(srv);
    expect(result).toMatchObject({
      total: expect.any(Number),
      published: expect.any(Number),
      outOfStock: expect.any(Number),
      uncategorized: expect.any(Number),
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeGreaterThanOrEqual(result.published);
    expect(result.outOfStock).toBeGreaterThanOrEqual(0);
    expect(result.uncategorized).toBeGreaterThanOrEqual(0);
  });
});

describe("getZeroResultSearches", () => {
  it("returns an array of {query, count} sorted desc, observes a fresh insert", async () => {
    const phrase = `${FIXTURE_PREFIX}query-${Math.random().toString(36).slice(2, 8)}`;
    const inserts = await Promise.all([
      srv.from("search_logs").insert({ query: phrase, result_count: 0 }).select("id").single(),
      srv.from("search_logs").insert({ query: phrase, result_count: 0 }).select("id").single(),
      srv.from("search_logs").insert({ query: phrase, result_count: 0 }).select("id").single(),
    ]);
    for (const r of inserts) {
      if (r.error) throw r.error;
      insertedSearchLogIds.push(r.data!.id);
    }

    const result = await getZeroResultSearches(srv, 7, 100);
    const found = result.find((r) => r.query === phrase);
    expect(found).toBeDefined();
    expect(found!.count).toBe(3);

    // Sort invariant
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });
});

describe("getMutationsThisWeek", () => {
  it("groups audit_logs entries this week by action, sorted desc", async () => {
    const action = `${FIXTURE_PREFIX}action`;
    const inserts = await Promise.all([
      srv
        .from("audit_logs")
        .insert({
          action,
          entity_type: "session",
          entity_id: "00000000-0000-0000-0000-000000000000",
          request_id: `${FIXTURE_REQUEST_ID}-a`,
        })
        .select("id")
        .single(),
      srv
        .from("audit_logs")
        .insert({
          action,
          entity_type: "session",
          entity_id: "00000000-0000-0000-0000-000000000000",
          request_id: `${FIXTURE_REQUEST_ID}-b`,
        })
        .select("id")
        .single(),
    ]);
    for (const r of inserts) {
      if (r.error) throw r.error;
      insertedAuditIds.push(r.data!.id);
    }

    const result = await getMutationsThisWeek(srv, 100);
    const found = result.find((r) => r.action === action);
    expect(found).toBeDefined();
    expect(found!.count).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count);
    }
  });
});

describe("getAISpendMTD", () => {
  it("returns budget + non-negative usdSpent", async () => {
    const result = await getAISpendMTD(srv);
    expect(result.budgetUsd).toBe(AI_BUDGET_USD_MTD);
    expect(result.usdSpent).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.usdSpent)).toBe(true);
  });
});

describe("getBrokenImagesCount", () => {
  it("returns a non-negative integer", async () => {
    const n = await getBrokenImagesCount(srv);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

describe("listRunningJobs", () => {
  it("returns an array of {id, kind, status, progress, total} for queued/running rows", async () => {
    const insert = await srv
      .from("background_jobs")
      .insert({
        kind: `${FIXTURE_PREFIX}kind`,
        status: "queued",
        progress: 0,
        total: 100,
      })
      .select("id")
      .single();
    if (insert.error) throw insert.error;
    insertedJobIds.push(insert.data!.id);

    const result = await listRunningJobs(srv, 100);
    const found = result.find((j) => j.id === insert.data!.id);
    expect(found).toBeDefined();
    expect(found!).toMatchObject({
      kind: `${FIXTURE_PREFIX}kind`,
      status: "queued",
      progress: 0,
      total: 100,
    });
  });
});
