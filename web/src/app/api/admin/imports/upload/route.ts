/**
 * POST /api/admin/imports/upload
 *
 * Validate-only CSV upload. Writes one `import_runs` row + one
 * `import_run_rows` row per parsed CSV line. Tags each with an
 * `action` enum (`create` / `update` / `skip` / `error`). NO catalog
 * mutations — those happen on the explicit "Run import" action in
 * the report view.
 *
 * Limits:
 *   - 20 MB CSV
 *   - text/csv or text/plain MIME (sniffed via filename suffix +
 *     content; CSV files don't have magic bytes to file-type)
 *   - UTF-8 (BOM tolerated)
 */
import { NextResponse, type NextRequest } from "next/server";
import { isAuthError } from "@/lib/auth/errors";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  createImportRun,
  finaliseImportRun,
  insertImportRunRows,
} from "@/lib/db/admin/imports";
import { parseCsv } from "@/lib/imports/csv-parser";
import { classifyRow, fetchValidatorRefs } from "@/lib/imports/row-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let admin, user;
  try {
    const ctx = await requireAdminContext();
    admin = ctx.admin;
    user = ctx.user;
  } catch (err) {
    if (isAuthError(err)) {
      const status = err.code === "unauthenticated" ? 401 : 403;
      return NextResponse.json(
        { ok: false, error: { code: err.code } },
        { status },
      );
    }
    throw err;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", reason: "expected multipart/form-data" } },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", reason: "file missing" } },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "too_large", size: file.size, maxSize: MAX_BYTES },
      },
      { status: 413 },
    );
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".txt")) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_mime", reason: "expected .csv" } },
      { status: 400 },
    );
  }

  const text = await file.text();
  const { headers, rows: csvRows, warnings } = parseCsv(text);

  // Need at least `sku`, `name`, `base_price_inr` per the schema —
  // surface early so the owner gets a clear message instead of N
  // per-row validation failures.
  const required = ["sku", "name", "base_price_inr"];
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "missing_columns",
          missing,
          headers,
        },
      },
      { status: 400 },
    );
  }

  // Create the run first so even an empty CSV produces a row the
  // owner can inspect.
  const run = await createImportRun(admin, {
    filename: file.name,
    createdBy: user.id,
  });

  if (csvRows.length === 0) {
    await finaliseImportRun(admin, run.id, {
      total: 0,
      successCount: 0,
      errorCount: 0,
      finalStatus: "succeeded",
    });
    return NextResponse.json({
      ok: true,
      importRunId: run.id,
      total: 0,
      warnings,
    });
  }

  // Pre-fetch references once for the whole batch.
  const refs = await fetchValidatorRefs(admin, csvRows);

  const staged: Array<{
    row_number: number;
    sku: string | null;
    action: "create" | "update" | "skip" | "error";
    error_message: string | null;
    raw_json: Record<string, unknown>;
  }> = [];

  let successCount = 0;
  let errorCount = 0;
  for (let i = 0; i < csvRows.length; i++) {
    const classified = classifyRow(csvRows[i], refs);
    staged.push({
      row_number: i + 1,
      sku: (csvRows[i].sku ?? null) || null,
      action: classified.action,
      error_message: classified.error_message,
      raw_json: classified.raw_json,
    });
    if (classified.action === "error") errorCount++;
    else successCount++;
  }

  await insertImportRunRows(admin, run.id, staged);
  await finaliseImportRun(admin, run.id, {
    total: csvRows.length,
    successCount,
    errorCount,
    finalStatus: "succeeded",
  });

  // Audit
  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "import.upload",
    entity_type: "import_run",
    entity_id: run.id,
    before_json: null,
    after_json: {
      filename: file.name,
      total: csvRows.length,
      success: successCount,
      errors: errorCount,
    } as never,
    request_id:
      req.headers.get("x-vercel-id") ??
      req.headers.get("x-request-id") ??
      crypto.randomUUID(),
  });

  return NextResponse.json({
    ok: true,
    importRunId: run.id,
    total: csvRows.length,
    success: successCount,
    errors: errorCount,
    warnings,
  });
}
