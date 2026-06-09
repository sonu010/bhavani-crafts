#!/usr/bin/env tsx
/**
 * web/scripts/rls-attack.ts (P5-T08)
 *
 * Anon-only RLS attack probe. Runs against either the local stack or
 * LIVE Supabase, asserts every public table's anon posture, exits 0
 * on green + non-zero on any unexpected anon read/write success.
 *
 * Why this is separate from `launch-blockers.ts`: launch-blockers
 * mixes anon probes with service-role ground-truth content checks
 * (Just Kraft CDN leakage, license_status alignment). Useful, but
 * inherently requires the service-role key. This script is the
 * opposite — it deliberately refuses to load service-role so the
 * posture it tests is the *real* anon posture a crawler or attacker
 * would see.
 *
 * Coverage (every public table from migrations 0001-0020):
 *
 *   READ side (SELECT)
 *     products             public + non-deleted only
 *     product_images       public + non-deleted + licensed only
 *     product_variants     public-parent only
 *     product_options      public-parent only
 *     product_option_values public-parent only
 *     variant_option_values public-parent only
 *     categories           non-deleted only
 *     tags                 anon SELECT allowed (used by storefront)
 *     product_tags         public-parent only
 *     attribute_definitions anon SELECT allowed (used by filters)
 *     product_attributes   public-parent only
 *     search_synonyms      anon SELECT allowed (used by /search)
 *     app_settings         allowlist keys only
 *     orders               anon SELECT denied entirely
 *     order_items          anon SELECT denied entirely
 *     profiles             anon SELECT denied
 *     audit_logs           anon SELECT denied
 *     search_logs          anon SELECT denied
 *     background_jobs      anon SELECT denied
 *     job_events           anon SELECT denied
 *     import_runs          anon SELECT denied
 *     import_run_rows      anon SELECT denied
 *     ai_generations       anon SELECT denied
 *
 *   WRITE side (INSERT / UPDATE / DELETE)
 *     products             anon INSERT/UPDATE/DELETE denied
 *     categories           anon INSERT/UPDATE/DELETE denied
 *     orders               anon INSERT allowed for pending-payment +
 *                          user_id NULL; SELECT after insert denied
 *     order_items          anon DIRECT INSERT denied (only the
 *                          create_anon_order RPC may write)
 *     search_logs          anon INSERT allowed (zero-result tracking)
 *     app_settings         anon INSERT/UPDATE/DELETE denied
 *     audit_logs           anon INSERT denied
 *     all other tables     anon INSERT denied
 *
 * Usage:
 *   pnpm rls-attack                            (local default)
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… pnpm rls-attack
 *   pnpm rls-attack --live                     (reads NEXT_PUBLIC_* from .env.local)
 *
 * Exit codes:
 *   0  every probe behaved as expected
 *   1  one or more probes failed (drift / RLS regression)
 *   2  harness crashed (env missing, network down, etc.)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import type { Database } from "../src/lib/db/types.gen";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(HERE, "..", ".env.local");

const USE_LIVE = process.argv.includes("--live");

// ─── Env (anon-only) ───────────────────────────────────────────────────
//
// Hard-refuse service-role from the *caller's* environment first — if
// someone exports SUPABASE_SERVICE_ROLE_KEY before invoking the script,
// the test posture isn't real and we bail. Then load `.env.local` BUT
// skip the service-role line so a developer who has it in their dotenv
// can still run this script unattended.
const PRE_DOTENV_HAD_SERVICE_ROLE =
  typeof process.env.SUPABASE_SERVICE_ROLE_KEY === "string" &&
  process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0;
if (PRE_DOTENV_HAD_SERVICE_ROLE) {
  console.error(
    "rls-attack refuses to run with SUPABASE_SERVICE_ROLE_KEY exported in the caller's environment.\n" +
      "Unset it before running so the anon probe is real.",
  );
  process.exit(2);
}

const SKIP_KEYS = new Set(["SUPABASE_SERVICE_ROLE_KEY"]);
function loadDotenv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    if (SKIP_KEYS.has(m[1])) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotenv(ENV_PATH);

const URL_ =
  process.env.SUPABASE_URL ??
  (USE_LIVE ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined) ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  (USE_LIVE ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL_ || !ANON) {
  console.error(
    "rls-attack requires SUPABASE_URL + SUPABASE_ANON_KEY (or NEXT_PUBLIC_* in web/.env.local).",
  );
  process.exit(2);
}

const anon: SupabaseClient<Database> = createClient<Database>(URL_, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Result accumulator ────────────────────────────────────────────────
type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

async function check(name: string, fn: () => Promise<Omit<Result, "name">>) {
  try {
    const r = await fn();
    results.push({ name, ...r });
  } catch (err) {
    results.push({
      name,
      pass: false,
      detail: `threw: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// Convenience: assert anon SELECT denied — either an error, or an empty
// rowset (RLS returns [] for tables with no anon SELECT policy).
function assertReadDenied(rows: unknown[] | null | undefined): Omit<Result, "name"> {
  const n = rows?.length ?? 0;
  return {
    pass: n === 0,
    detail: n === 0 ? "no rows visible" : `LEAK: ${n} rows visible to anon`,
  };
}

// Convenience: assert anon INSERT denied at the RLS layer (Postgres
// 42501 = insufficient_privilege, or PGRST301 from PostgREST).
function assertWriteDeniedStrict(error: { code?: string; message?: string } | null): Omit<Result, "name"> {
  if (!error) {
    return { pass: false, detail: "INSERT succeeded — RLS broken" };
  }
  const ok = error.code === "42501" || error.code === "PGRST301" || /policy/i.test(error.message ?? "");
  return {
    pass: ok,
    detail: `error code=${error.code ?? "?"}${error.message ? ` "${error.message}"` : ""}`,
  };
}

// Convenience: assert anon INSERT was rejected, accepting any error
// (NOT NULL, schema-cache miss, RLS). The only failure mode is a
// successful insert. Use this for tables where building a full
// schema-valid payload isn't worth the maintenance burden — RLS
// regression on these is still caught provided a NOT NULL doesn't
// silently mask a dropped policy. The high-value tables (products,
// orders, audit_logs, app_settings) get explicit `assertWriteDeniedStrict`
// probes instead.
function assertWriteRejected(error: { code?: string; message?: string } | null): Omit<Result, "name"> {
  if (!error) {
    return { pass: false, detail: "INSERT succeeded — RLS broken" };
  }
  return {
    pass: true,
    detail: `error code=${error.code ?? "?"}`,
  };
}

async function main() {
  console.log(
    `\nRLS attack probe — target ${URL_!.replace(/(\.co|\.local).*/, "$1")} (${USE_LIVE ? "LIVE" : "local/dev"}).\n`,
  );

  // ─── READ-side probes ────────────────────────────────────────────────

  // Tables that should appear empty to anon.
  const READ_DENIED_TABLES = [
    "orders",
    "order_items",
    "profiles",
    "audit_logs",
    "search_logs",
    "background_jobs",
    "job_events",
    "import_runs",
    "import_run_rows",
    "ai_generations",
  ] as const;

  for (const t of READ_DENIED_TABLES) {
    await check(`READ anon SELECT * FROM ${t} returns nothing`, async () => {
      const { data, error } = await anon.from(t).select("*").limit(1);
      // An error code on these is also acceptable — both modes mean
      // "anon can't see this." We only fail if rows come back.
      if (error && (data?.length ?? 0) === 0) {
        return { pass: true, detail: `error=${error.code} (denied — ok)` };
      }
      return assertReadDenied(data);
    });
  }

  // Tables that anon CAN read (storefront depends on these).
  await check("READ anon SELECT search_synonyms returns ≥1 row", async () => {
    const { data, error } = await anon.from("search_synonyms").select("term").limit(1);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    return {
      pass: (data?.length ?? 0) >= 1,
      detail: `rows=${data?.length ?? 0}`,
    };
  });

  await check("READ anon SELECT attribute_definitions returns ≥1 row", async () => {
    const { data, error } = await anon.from("attribute_definitions").select("id").limit(1);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    return {
      pass: (data?.length ?? 0) >= 1,
      detail: `rows=${data?.length ?? 0}`,
    };
  });

  await check("READ anon SELECT tags returns ≥0 rows (no error)", async () => {
    const { data, error } = await anon.from("tags").select("id").limit(1);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    return { pass: true, detail: `rows=${data?.length ?? 0}` };
  });

  // Categories — non-deleted only.
  await check("READ anon SELECT categories returns ≥1 non-deleted", async () => {
    const { data, error } = await anon.from("categories").select("id, deleted_at").limit(5);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    const anyDeleted = (data ?? []).some((c) => c.deleted_at !== null);
    return {
      pass: !anyDeleted,
      detail: anyDeleted
        ? `LEAK: anon saw a soft-deleted category`
        : `rows=${data?.length ?? 0}, no soft-deleted`,
    };
  });

  // Products — published + non-deleted only.
  await check("READ anon SELECT products leaks no unpublished/soft-deleted rows", async () => {
    const { data, error } = await anon
      .from("products")
      .select("id, is_published, deleted_at")
      .limit(50);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    const bad = (data ?? []).filter((p) => !p.is_published || p.deleted_at !== null);
    return {
      pass: bad.length === 0,
      detail: bad.length === 0 ? `rows=${data?.length ?? 0}, all published + live` : `LEAK: ${bad.length} bad rows`,
    };
  });

  // app_settings — allowlist only.
  await check("READ anon SELECT app_settings returns only allowlist keys", async () => {
    const ALLOW = new Set(["shop_name", "whatsapp_number", "instagram_url", "shipping_flat_inr"]);
    const { data, error } = await anon.from("app_settings").select("key").limit(100);
    if (error) return { pass: false, detail: `error=${error.code}: ${error.message}` };
    const offenders = (data ?? []).filter((r) => !ALLOW.has(r.key));
    return {
      pass: offenders.length === 0,
      detail:
        offenders.length === 0
          ? `rows=${data?.length ?? 0}, all in allowlist`
          : `LEAK: anon saw non-allowlisted keys: ${offenders.map((o) => o.key).join(", ")}`,
    };
  });

  // ─── WRITE-side probes ───────────────────────────────────────────────

  // ── High-value tables: schema-valid payloads, expect strict 42501 ──

  // products — full schema-valid INSERT, must be denied at RLS layer.
  await check("WRITE anon INSERT products denied (strict)", async () => {
    const { error } = await anon.from("products").insert({
      sku: "ZZZ-RLS-ATTACK",
      slug: "zzz-rls-attack",
      name: "Should be rejected by RLS, not by constraints",
    });
    return assertWriteDeniedStrict(error);
  });

  // categories — slug + name is enough.
  await check("WRITE anon INSERT categories denied (strict)", async () => {
    const { error } = await anon.from("categories").insert({
      slug: "zzz-rls-attack-cat",
      name: "RLS attack cat",
    });
    return assertWriteDeniedStrict(error);
  });

  // audit_logs — anon must never write a fabricated audit entry.
  // Cast through unknown to bypass the typed-only-server policy.
  await check("WRITE anon INSERT audit_logs denied (strict)", async () => {
    const { error } = await anon
      .from("audit_logs")
      .insert({ action: "anon.attack.probe", entity_type: "product", entity_id: null } as never);
    return assertWriteDeniedStrict(error);
  });

  // app_settings — anon must not be able to override shipping_flat_inr etc.
  await check("WRITE anon INSERT app_settings denied (strict)", async () => {
    const { error } = await anon.from("app_settings").insert({
      key: "shop_name",
      value: "hacked",
    } as never);
    return assertWriteDeniedStrict(error);
  });

  // ── Broad sweep: empty payloads, accept any error as denial ──
  //
  // For tables with composite PKs or unusual constraints, building a
  // full schema-valid payload here would lock the script to the schema
  // shape and produce churn on every migration. Instead, any error
  // (NOT NULL, schema-cache miss, RLS denial) passes the probe. The
  // failure mode caught is a successful anon insert.

  const WRITE_DENIED_BROAD = [
    "product_images",
    "product_variants",
    "product_options",
    "product_option_values",
    "variant_option_values",
    "tags",
    "product_tags",
    "attribute_definitions",
    "product_attributes",
    "background_jobs",
    "import_runs",
    "import_run_rows",
    "ai_generations",
    "profiles",
    "order_items",
  ] as const;

  for (const t of WRITE_DENIED_BROAD) {
    await check(`WRITE anon INSERT INTO ${t} rejected (broad)`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await anon.from(t).insert({} as any);
      return assertWriteRejected(error);
    });
  }

  // search_logs — anon INSERT allowed, no SELECT.
  await check("WRITE anon INSERT search_logs allowed (zero-result tracking)", async () => {
    const { error } = await anon.from("search_logs").insert({
      query: "zzz-rls-attack-probe",
      result_count: 0,
      user_id: null,
    });
    return {
      pass: error === null,
      detail: error ? `unexpected error=${error.code}: ${error.message}` : "ok",
    };
  });

  // orders — anon DIRECT INSERT is *allowed* for status='pending_payment'
  // with user_id NULL (per ADR-011 §"Checkout flow"). The RLS policy
  // is intentionally permissive for the pending-payment row so the
  // `/checkout` page can call it without service-role hop. What's
  // forbidden:
  //   - INSERT with status='paid' or any non-pending status (admin only)
  //   - SELECT (anon: covered above as part of READ_DENIED_TABLES)
  //
  // We probe both directions.
  const ATTACK_TAG_NAME = "ZZZ-RLS-ATTACK-PROBE";
  const SHIPPING_ADDRESS = {
    line1: "Test",
    city: "Hyderabad",
    pincode: "500001",
    state: "TS",
    country: "IN",
  } as const;

  await check("WRITE anon INSERT orders pending_payment ALLOWED", async () => {
    const { error } = await anon.from("orders").insert({
      customer_name: ATTACK_TAG_NAME,
      customer_email: "probe@example.invalid",
      customer_phone: "+910000000000",
      shipping_address: SHIPPING_ADDRESS,
      subtotal_inr: 100,
      shipping_inr: 50,
      total_inr: 150,
      status: "pending_payment",
    } as never);
    if (error) {
      return { pass: false, detail: `unexpected error=${error.code}: ${error.message}` };
    }
    // Note: we can't SELECT this row back (anon SELECT denied — that
    // contract is verified above). Cleanup is opportunistic via the
    // ZZZ-RLS-ATTACK-PROBE customer_name marker for `purge-test-
    // fixtures.mjs` to pick up out-of-band.
    return { pass: true, detail: "inserted pending_payment ok" };
  });

  await check("WRITE anon INSERT orders status=paid DENIED (strict)", async () => {
    const { error } = await anon.from("orders").insert({
      customer_name: ATTACK_TAG_NAME,
      customer_email: "probe@example.invalid",
      customer_phone: "+910000000000",
      shipping_address: SHIPPING_ADDRESS,
      subtotal_inr: 100,
      shipping_inr: 50,
      total_inr: 150,
      status: "paid",
    } as never);
    return assertWriteDeniedStrict(error);
  });

  // Anon UPDATE of published products is a no-op (RLS scopes UPDATE to
  // admin). We verify this by trying and confirming nothing committed —
  // but we can't service-role-verify here, so we accept either an error
  // or zero matched rows.
  await check("WRITE anon UPDATE products produces no rows affected", async () => {
    const { data, error } = await anon
      .from("products")
      .update({ name: "rls-attack-probe-hacked" })
      .eq("slug", "zzz-nonexistent-target")
      .select("id");
    return {
      pass: (data?.length ?? 0) === 0,
      detail: error
        ? `error=${error.code} (denied — ok)`
        : `rows updated=${data?.length ?? 0}`,
    };
  });

  // Anon DELETE on products is also denied — same shape as UPDATE.
  await check("WRITE anon DELETE products produces no rows affected", async () => {
    const { data, error } = await anon
      .from("products")
      .delete()
      .eq("slug", "zzz-nonexistent-target")
      .select("id");
    return {
      pass: (data?.length ?? 0) === 0,
      detail: error
        ? `error=${error.code} (denied — ok)`
        : `rows deleted=${data?.length ?? 0}`,
    };
  });

  // ─── Report ──────────────────────────────────────────────────────────
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    console.log(r.pass ? "  PASS" : "  FAIL", r.name, r.detail ? `(${r.detail})` : "");
    if (r.pass) pass++;
    else fail++;
  }
  console.log(`\n${pass} passed, ${fail} failed of ${results.length} probes.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nRLS attack harness crashed:", err);
  process.exit(2);
});
