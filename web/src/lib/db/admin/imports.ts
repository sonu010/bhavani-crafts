/**
 * Admin CSV-import data layer.
 *
 * Two phases:
 *   - validate  → writes `import_runs` (one row) + `import_run_rows`
 *     (one per CSV row) tagged with action enum + error_message.
 *     NO catalog mutations.
 *   - execute   → reads back the staged rows; applies actions to
 *     `products`; updates `applied_at`. Catalog mutations happen
 *     here only (synchronous path; jobified worker is a follow-up).
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export type ImportAction = Database["public"]["Enums"]["import_action"];
export type JobStatus = Database["public"]["Enums"]["job_status"];

export interface ImportRunRow {
  id: string;
  filename: string | null;
  status: JobStatus;
  total_rows: number;
  success_count: number;
  error_count: number;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface ImportRunRowRow {
  id: string;
  import_run_id: string;
  row_number: number;
  sku: string | null;
  action: ImportAction | null;
  error_message: string | null;
  raw_json: Record<string, unknown>;
  applied_at: string | null;
}

export async function createImportRun(
  supabase: SC,
  opts: {
    filename: string;
    createdBy: string | null;
  },
): Promise<ImportRunRow> {
  const { data, error } = await supabase
    .from("import_runs")
    .insert({
      filename: opts.filename,
      status: "queued",
      total_rows: 0,
      success_count: 0,
      error_count: 0,
      created_by: opts.createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createImportRun: ${error.message}`);
  return data as ImportRunRow;
}

export async function insertImportRunRows(
  supabase: SC,
  runId: string,
  rows: Array<{
    row_number: number;
    sku: string | null;
    action: ImportAction;
    error_message: string | null;
    raw_json: Record<string, unknown>;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => ({
      import_run_id: runId,
      ...r,
      raw_json: r.raw_json as never,
    }));
    const { error } = await supabase.from("import_run_rows").insert(slice);
    if (error) throw new Error(`insertImportRunRows (chunk ${i}): ${error.message}`);
  }
}

export async function finaliseImportRun(
  supabase: SC,
  runId: string,
  counts: {
    total: number;
    successCount: number;
    errorCount: number;
    finalStatus: JobStatus;
  },
): Promise<void> {
  const { error } = await supabase
    .from("import_runs")
    .update({
      total_rows: counts.total,
      success_count: counts.successCount,
      error_count: counts.errorCount,
      status: counts.finalStatus,
      finished_at:
        counts.finalStatus === "queued" || counts.finalStatus === "running"
          ? null
          : new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(`finaliseImportRun: ${error.message}`);
}

export async function listImportRuns(supabase: SC): Promise<ImportRunRow[]> {
  const { data, error } = await supabase
    .from("import_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`listImportRuns: ${error.message}`);
  return (data ?? []) as ImportRunRow[];
}

export async function getImportRun(
  supabase: SC,
  id: string,
): Promise<ImportRunRow | null> {
  const { data, error } = await supabase
    .from("import_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getImportRun: ${error.message}`);
  return (data as ImportRunRow | null) ?? null;
}

export interface ImportRowSummary {
  total: number;
  byAction: Record<ImportAction | "untagged", number>;
}

export async function getImportRowSummary(
  supabase: SC,
  importRunId: string,
): Promise<ImportRowSummary> {
  // Paginate through every row to bucket by action. ≤ ~5K rows
  // per run so this is cheap.
  const PAGE = 1000;
  const byAction: Record<ImportAction | "untagged", number> = {
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    untagged: 0,
  };
  let total = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("import_run_rows")
      .select("action")
      .eq("import_run_id", importRunId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`getImportRowSummary: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      total += 1;
      const k = (r.action ?? "untagged") as keyof typeof byAction;
      byAction[k] = (byAction[k] ?? 0) + 1;
    }
    if (rows.length < PAGE) break;
  }
  return { total, byAction };
}

export async function listImportRunRows(
  supabase: SC,
  importRunId: string,
  opts: { action?: ImportAction | null; page?: number; perPage?: number } = {},
): Promise<{ rows: ImportRunRowRow[]; total: number }> {
  const page = opts.page ?? 0;
  const perPage = opts.perPage ?? 100;
  let q = supabase
    .from("import_run_rows")
    .select("*", { count: "exact" })
    .eq("import_run_id", importRunId)
    .order("row_number", { ascending: true })
    .range(page * perPage, (page + 1) * perPage - 1);
  if (opts.action) q = q.eq("action", opts.action);
  const { data, count, error } = await q;
  if (error) throw new Error(`listImportRunRows: ${error.message}`);
  return {
    rows: (data ?? []) as ImportRunRowRow[],
    total: count ?? 0,
  };
}

/**
 * Apply one staged row to the catalog. The caller passes the parsed
 * normalised payload from `raw_json._normalized` (see row-validator).
 *
 * Returns the affected product id (for the audit log + applied lookup).
 */
export async function applyOneRow(
  supabase: SC,
  row: ImportRunRowRow,
): Promise<{ ok: true; productId: string | null } | { ok: false; message: string }> {
  const action = row.action;
  if (action === "skip" || action === "error" || action === null) {
    return { ok: true, productId: null };
  }
  const raw = row.raw_json as Record<string, unknown>;
  const normalised = (raw._normalized ?? {}) as Record<string, unknown>;
  const tagIds = Array.isArray(raw._tag_ids) ? (raw._tag_ids as string[]) : [];

  if (action === "create") {
    const ins = await supabase
      .from("products")
      .insert({
        sku: normalised.sku as string,
        slug: normalised.slug as string,
        name: normalised.name as string,
        short_description: (normalised.short_description as string | null) ?? null,
        description: (normalised.description as string | null) ?? null,
        base_price_inr: normalised.base_price_inr as number,
        compare_at_price_inr: (normalised.compare_at_price_inr as number | null) ?? null,
        stock_status: (normalised.stock_status as
          | "in_stock"
          | "low_stock"
          | "out_of_stock"
          | "made_to_order"
          | "unknown") ?? "unknown",
        stock_quantity: (normalised.stock_quantity as number | null) ?? null,
        category_id: (normalised.category_id as string | null) ?? null,
        review_status: "needs_review",
        is_published: false,
        source: "manual",
      })
      .select("id")
      .single();
    if (ins.error) return { ok: false, message: ins.error.message };
    const productId = ins.data.id;
    if (tagIds.length > 0) {
      await supabase
        .from("product_tags")
        .upsert(
          tagIds.map((tag_id) => ({ product_id: productId, tag_id })),
          { onConflict: "product_id,tag_id", ignoreDuplicates: true },
        );
    }
    return { ok: true, productId };
  }

  // update path
  const found = await supabase
    .from("products")
    .select("id")
    .eq("sku", normalised.sku as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (found.error) return { ok: false, message: found.error.message };
  if (!found.data) return { ok: false, message: "sku no longer exists" };

  const upd = await supabase
    .from("products")
    .update({
      slug: normalised.slug as string,
      name: normalised.name as string,
      short_description: (normalised.short_description as string | null) ?? null,
      description: (normalised.description as string | null) ?? null,
      base_price_inr: normalised.base_price_inr as number,
      compare_at_price_inr: (normalised.compare_at_price_inr as number | null) ?? null,
      stock_status: (normalised.stock_status as
        | "in_stock"
        | "low_stock"
        | "out_of_stock"
        | "made_to_order"
        | "unknown") ?? "unknown",
      stock_quantity: (normalised.stock_quantity as number | null) ?? null,
      category_id: (normalised.category_id as string | null) ?? null,
    })
    .eq("id", found.data.id);
  if (upd.error) return { ok: false, message: upd.error.message };

  if (tagIds.length > 0) {
    await supabase
      .from("product_tags")
      .upsert(
        tagIds.map((tag_id) => ({ product_id: found.data!.id, tag_id })),
        { onConflict: "product_id,tag_id", ignoreDuplicates: true },
      );
  }
  return { ok: true, productId: found.data.id };
}

export async function markRowApplied(
  supabase: SC,
  rowId: string,
): Promise<void> {
  const { error } = await supabase
    .from("import_run_rows")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) throw new Error(`markRowApplied: ${error.message}`);
}
