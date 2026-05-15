/**
 * GET /api/health
 *
 * Confirms the server can reach Supabase and round-trip a query through the
 * cookie-authed client. Until Phase 1 lands the schema, we query a sentinel
 * non-existent table and treat Postgres error code 42P01 ("undefined_table")
 * as a positive connectivity signal.
 *
 * Returns:
 *   { ok: true,  db: 'connected' }      — connectivity verified
 *   { ok: false, db: 'error', code }    — Supabase reachable but unexpected error
 *   { ok: false, db: 'misconfigured' }  — env vars missing
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/server";

export async function GET() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json(
      { ok: false, db: "misconfigured" },
      { status: 500 },
    );
  }
  try {
    const supabase = await createServerClient();
    const { error } = await supabase
      .from("_health_sentinel" as never)
      .select("*")
      .limit(1);
    if (!error) {
      return NextResponse.json({ ok: true, db: "connected" });
    }
    // Codes that indicate "Supabase reachable, table just doesn't exist yet":
    //   42P01   = Postgres "relation does not exist"
    //   PGRST205 = PostgREST "table not in schema cache"
    // Both are positive connectivity signals until the schema lands in Phase 1.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ ok: true, db: "connected", note: "schema empty" });
    }
    return NextResponse.json(
      { ok: false, db: "error", code: error.code, message: error.message },
      { status: 500 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "exception",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
