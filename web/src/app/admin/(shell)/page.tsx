import { createAdminClient } from "@/lib/db/admin";
import {
  getAISpendMTD,
  getBrokenImagesCount,
  getCatalogCounts,
  getMutationsThisWeek,
  getZeroResultSearches,
  listRunningJobs,
} from "@/lib/db/admin/dashboard";
import { AISpendMtdWidget } from "./_widgets/ai-spend-mtd";
import { BrokenImagesWidget } from "./_widgets/broken-images";
import { CatalogCountsWidget } from "./_widgets/catalog-counts";
import { MutationsThisWeekWidget } from "./_widgets/mutations-this-week";
import { RunningJobsWidget } from "./_widgets/running-jobs";
import { ZeroResultSearchesWidget } from "./_widgets/zero-result-searches";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard.
 *
 * Six diagnostic widgets in a 2×3 grid (single column under 640px).
 * Layout locked in SESSION-RESUME §"Admin dashboard at /admin". No
 * revenue / customer / conversion widgets — MVP has no checkout, no
 * accounts, no orders; inventing those numbers would be lying.
 *
 * Data fetched in parallel via Promise.all using the service-role client
 * (audit_logs / search_logs / ai_generations are admin-only-RLS;
 * service-role keeps the read posture explicit + matches the rest of
 * /admin/*).
 */
export default async function AdminDashboardPage() {
  const supabase = createAdminClient();
  const [
    catalog,
    zeroResultSearches,
    mutations,
    aiSpend,
    brokenImagesCount,
    runningJobs,
  ] = await Promise.all([
    getCatalogCounts(supabase),
    getZeroResultSearches(supabase),
    getMutationsThisWeek(supabase),
    getAISpendMTD(supabase),
    getBrokenImagesCount(supabase),
    listRunningJobs(supabase),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-bark-900">Dashboard</h1>
        <p className="text-sm text-stone-500">
          Diagnostic snapshot. What needs your attention today?
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CatalogCountsWidget counts={catalog} />
        <ZeroResultSearchesWidget searches={zeroResultSearches} />
        <MutationsThisWeekWidget mutations={mutations} />
        <AISpendMtdWidget spend={aiSpend} />
        <BrokenImagesWidget count={brokenImagesCount} />
        <RunningJobsWidget jobs={runningJobs} />
      </div>
    </div>
  );
}
