"use server";

/**
 * CSV-import execution actions.
 *
 * Sync-only path for the MVP: the owner clicks "Run import" and the
 * action processes every staged row inline. The 60-second serverless
 * timeout caps it at ~thousands of rows; for larger imports T24's
 * jobified path takes over (worker not yet built).
 *
 * Per-row apply:
 *   - skip / error → no-op (left as audit trace)
 *   - create / update → invoke `applyOneRow` (data layer), write
 *     `product.<verb>_via_import` audit row, set `applied_at`.
 *
 * Idempotent on re-run via the `applied_at IS NULL` filter.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  applyOneRow,
  finaliseImportRun,
  getImportRun,
  listImportRunRows,
  markRowApplied,
} from "@/lib/db/admin/imports";

export type RunImportResult =
  | {
      ok: true;
      applied: number;
      failed: number;
      skipped: number;
    }
  | { ok: false; error: { code: "not_found" | "already_running" } };

export async function runImportAction(
  importRunId: string,
): Promise<RunImportResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const run = await getImportRun(admin, importRunId);
  if (!run) return { ok: false, error: { code: "not_found" } };
  if (run.status === "running") {
    return { ok: false, error: { code: "already_running" } };
  }

  // Flip status → running so concurrent triggers see this in-flight.
  await admin
    .from("import_runs")
    .update({ status: "running", finished_at: null })
    .eq("id", importRunId);

  let applied = 0;
  let failed = 0;
  let skipped = 0;

  const PAGE_SIZE = 100;
  for (let page = 0; ; page++) {
    const { rows } = await listImportRunRows(admin, importRunId, {
      page,
      perPage: PAGE_SIZE,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.applied_at !== null) {
        skipped++;
        continue;
      }
      const result = await applyOneRow(admin, row);
      if (!result.ok) {
        failed++;
        // Record the failure into the row so the report shows it.
        await admin
          .from("import_run_rows")
          .update({
            error_message: `apply_failed: ${result.message}`,
            action: "error",
          })
          .eq("id", row.id);
        continue;
      }
      if (result.productId === null) {
        // skip / error rows
        skipped++;
        continue;
      }
      await markRowApplied(admin, row.id);
      applied++;

      const auditAction =
        row.action === "create"
          ? "product.create_via_import"
          : "product.update_via_import";
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: auditAction,
        entity_type: "product",
        entity_id: result.productId,
        before_json: null,
        after_json: row.raw_json as never,
        request_id: requestId,
      });
    }

    // Revalidate after every chunk so the storefront sees applied
    // changes incrementally rather than only at the end.
    updateTag("products");
    updateTag("categories");
    revalidatePath("/admin/products");

    if (rows.length < PAGE_SIZE) break;
  }

  const finalStatus = failed === 0 ? "succeeded" : "failed";
  await finaliseImportRun(admin, importRunId, {
    total: run.total_rows,
    successCount: applied,
    errorCount: failed,
    finalStatus,
  });

  revalidatePath(`/admin/imports/${importRunId}`);
  return { ok: true, applied, failed, skipped };
}
