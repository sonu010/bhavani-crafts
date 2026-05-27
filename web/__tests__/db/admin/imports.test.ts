/**
 * Integration tests for the imports data layer (P2-T23 + T24-lite).
 *
 * Covers:
 *   - createImportRun + insertImportRunRows round-trip
 *   - getImportRowSummary aggregates correctly
 *   - applyOneRow create / update + markRowApplied flips applied_at
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  applyOneRow,
  createImportRun,
  finaliseImportRun,
  getImportRowSummary,
  insertImportRunRows,
  listImportRunRows,
  markRowApplied,
} from "@/lib/db/admin/imports";
import { srv } from "../_clients";

const runIds: string[] = [];
const prodIds: string[] = [];
const catIds: string[] = [];

afterAll(async () => {
  if (prodIds.length > 0) {
    await srv.from("products").delete().in("id", prodIds);
  }
  if (catIds.length > 0) {
    await srv.from("categories").delete().in("id", catIds);
  }
  if (runIds.length > 0) {
    await srv.from("import_runs").delete().in("id", runIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

describe("createImportRun + insertImportRunRows + getImportRowSummary", () => {
  it("creates a run and counts rows by action", async () => {
    const run = await createImportRun(srv, {
      filename: `zzz-import-${rid()}.csv`,
      createdBy: null,
    });
    runIds.push(run.id);

    await insertImportRunRows(srv, run.id, [
      { row_number: 1, sku: "A", action: "create", error_message: null, raw_json: {} },
      { row_number: 2, sku: "B", action: "update", error_message: null, raw_json: {} },
      { row_number: 3, sku: "C", action: "skip", error_message: null, raw_json: {} },
      { row_number: 4, sku: "D", action: "error", error_message: "bad", raw_json: {} },
      { row_number: 5, sku: "E", action: "error", error_message: "bad", raw_json: {} },
    ]);

    const summary = await getImportRowSummary(srv, run.id);
    expect(summary.total).toBe(5);
    expect(summary.byAction.create).toBe(1);
    expect(summary.byAction.update).toBe(1);
    expect(summary.byAction.skip).toBe(1);
    expect(summary.byAction.error).toBe(2);
  });
});

describe("applyOneRow", () => {
  it("creates a product from a staged create row", async () => {
    const { data: cat } = await srv
      .from("categories")
      .insert({ slug: `zzz-imp-cat-${rid()}`, name: "imp cat" })
      .select("id")
      .single();
    catIds.push(cat!.id);

    const run = await createImportRun(srv, {
      filename: `zzz-apply-${rid()}.csv`,
      createdBy: null,
    });
    runIds.push(run.id);

    const sku = `ZZZ-IMP-${rid().toUpperCase()}`;
    const slug = `zzz-imp-prod-${rid()}`;
    await insertImportRunRows(srv, run.id, [
      {
        row_number: 1,
        sku,
        action: "create",
        error_message: null,
        raw_json: {
          _normalized: {
            sku,
            slug,
            name: "imp product",
            short_description: null,
            description: null,
            base_price_inr: 250,
            compare_at_price_inr: null,
            stock_status: "in_stock",
            stock_quantity: 5,
            category_id: cat!.id,
          },
          _tag_ids: [],
        },
      },
    ]);

    const { rows } = await listImportRunRows(srv, run.id);
    const row = rows[0];
    const result = await applyOneRow(srv, row);
    expect(result.ok).toBe(true);
    if (result.ok && result.productId) {
      prodIds.push(result.productId);
    }

    await markRowApplied(srv, row.id);

    const inserted = await srv
      .from("products")
      .select("id, sku, slug, name, category_id")
      .eq("sku", sku)
      .single();
    expect(inserted.data?.sku).toBe(sku);
    expect(inserted.data?.slug).toBe(slug);
    expect(inserted.data?.category_id).toBe(cat!.id);

    // Re-applying should be a no-op because applied_at is now set.
    const after = await listImportRunRows(srv, run.id);
    expect(after.rows[0].applied_at).not.toBeNull();

    // finaliseImportRun closes the loop
    await finaliseImportRun(srv, run.id, {
      total: 1,
      successCount: 1,
      errorCount: 0,
      finalStatus: "succeeded",
    });
    const closed = await srv
      .from("import_runs")
      .select("status, success_count, finished_at")
      .eq("id", run.id)
      .single();
    expect(closed.data?.status).toBe("succeeded");
    expect(closed.data?.success_count).toBe(1);
    expect(closed.data?.finished_at).not.toBeNull();
  });
});
