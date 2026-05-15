/**
 * GET /api/health
 *
 * Confirms the server can reach Supabase and round-trip a query.
 * Queries the categories table (which exists after 0001_init.sql).
 *
 * Returns 200 + ok:true on success.
 * Returns 500 + the Supabase error code on any failure.
 *
 * No fallback branches. Fail fast.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/server";

export async function GET() {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("categories")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
