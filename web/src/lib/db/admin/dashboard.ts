/**
 * Data-layer functions powering the /admin dashboard widgets (P2-T06).
 *
 * Six queries, all DI-Supabase per ADR-010. Service-role is recommended
 * at the call site because half of these read ops tables that are
 * admin-only-RLS — using service-role keeps the read posture explicit
 * even though an admin-authenticated client would also work via
 * is_admin().
 *
 * Performance budget: combined p50 ≤ 200ms on Supabase. If any function
 * breaches at scale, materialize a daily rollup table rather than adding
 * an in-memory cache — caches mask slow queries.
 *
 * MVP-scale shortcut: `getMutationsThisWeek` and `getZeroResultSearches`
 * group rows in TS after a bounded fetch instead of GROUP BY in Postgres.
 * Acceptable when audit_logs / search_logs row counts per query window
 * stay under a few thousand. Revisit with an RPC migration when measured
 * slow.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export const AI_BUDGET_USD_MTD = 20;

export interface CatalogCounts {
  total: number;
  published: number;
  outOfStock: number;
  uncategorized: number;
}

export async function getCatalogCounts(supabase: SC): Promise<CatalogCounts> {
  // Four head-count queries in parallel. PostgREST returns the count in
  // the response's `count` field when { count: 'exact', head: true }.
  const [total, published, outOfStock, uncategorized] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_published", true),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("stock_status", "out_of_stock"),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("category_id", null),
  ]);

  for (const r of [total, published, outOfStock, uncategorized]) {
    if (r.error) {
      throw new Error(`getCatalogCounts: ${r.error.message}`);
    }
  }

  return {
    total: total.count ?? 0,
    published: published.count ?? 0,
    outOfStock: outOfStock.count ?? 0,
    uncategorized: uncategorized.count ?? 0,
  };
}

export interface ZeroResultSearch {
  query: string;
  count: number;
}

export async function getZeroResultSearches(
  supabase: SC,
  sinceDays = 14,
  limit = 5,
): Promise<ZeroResultSearch[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("search_logs")
    .select("query")
    .eq("result_count", 0)
    .gte("created_at", since)
    .limit(2000);
  if (error) throw new Error(`getZeroResultSearches: ${error.message}`);

  const tally = new Map<string, number>();
  for (const row of data ?? []) {
    tally.set(row.query, (tally.get(row.query) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface MutationCount {
  action: string;
  count: number;
}

export async function getMutationsThisWeek(
  supabase: SC,
  limit = 5,
): Promise<MutationCount[]> {
  // date_trunc('week', now()) — Monday as week start in en_US locale. Use
  // ISO week (Monday). We compute on the JS side to keep it explicit.
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0, 0, 0, 0,
    ),
  );

  const { data, error } = await supabase
    .from("audit_logs")
    .select("action")
    .gte("created_at", monday.toISOString())
    .limit(5000);
  if (error) throw new Error(`getMutationsThisWeek: ${error.message}`);

  const tally = new Map<string, number>();
  for (const row of data ?? []) {
    tally.set(row.action, (tally.get(row.action) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface AISpend {
  usdSpent: number;
  budgetUsd: number;
}

export async function getAISpendMTD(supabase: SC): Promise<AISpend> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const { data, error } = await supabase
    .from("ai_generations")
    .select("usd_cost")
    .gte("created_at", monthStart.toISOString())
    .limit(10000);
  if (error) throw new Error(`getAISpendMTD: ${error.message}`);

  const usdSpent = (data ?? []).reduce((acc, row) => acc + (row.usd_cost ?? 0), 0);
  return { usdSpent, budgetUsd: AI_BUDGET_USD_MTD };
}

export async function getBrokenImagesCount(supabase: SC): Promise<number> {
  const { count, error } = await supabase
    .from("product_images")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .in("license_status", ["disputed", "removed"]);
  if (error) throw new Error(`getBrokenImagesCount: ${error.message}`);
  return count ?? 0;
}

export interface RunningJob {
  id: string;
  kind: string;
  status: Database["public"]["Enums"]["job_status"];
  progress: number;
  total: number;
}

export async function listRunningJobs(
  supabase: SC,
  limit = 5,
): Promise<RunningJob[]> {
  const { data, error } = await supabase
    .from("background_jobs")
    .select("id, kind, status, progress, total")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRunningJobs: ${error.message}`);
  return data ?? [];
}
