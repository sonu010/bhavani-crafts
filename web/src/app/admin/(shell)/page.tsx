import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getAISpendMTD,
  getBrokenImagesCount,
  getCatalogCounts,
  getMutationsThisWeek,
  getPendingOrdersSummary,
  getZeroResultSearches,
  listRunningJobs,
} from "@/lib/db/admin/dashboard";
import { perfStart } from "@/lib/perf";
import { AISpendMtdWidget } from "./_widgets/ai-spend-mtd";
import { BrokenImagesWidget } from "./_widgets/broken-images";
import { CatalogCountsWidget } from "./_widgets/catalog-counts";
import { MutationsThisWeekWidget } from "./_widgets/mutations-this-week";
import { PendingOrdersBanner } from "./_widgets/pending-orders-banner";
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
  const t = perfStart("/admin");
  // Gate: requireAdminContext blocks the service-role read until role +
  // AAL are verified. Without this, Next 16's parallel layout/page
  // fetching means the DB call could fire before the layout's redirect
  // wins (security boundary in the wrong layer).
  const { admin } = await requireAdminContext();
  t.mark("auth");
  const [
    catalog,
    zeroResultSearches,
    mutations,
    aiSpend,
    brokenImagesCount,
    runningJobs,
    pendingOrders,
  ] = await Promise.all([
    getCatalogCounts(admin),
    getZeroResultSearches(admin),
    getMutationsThisWeek(admin),
    getAISpendMTD(admin),
    getBrokenImagesCount(admin),
    listRunningJobs(admin),
    getPendingOrdersSummary(admin),
  ]);
  t.mark("queries");
  t.end();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-bark-900">Dashboard</h1>
        <p className="text-sm text-stone-500">
          Diagnostic snapshot. What needs your attention today?
        </p>
      </header>

      {/* Action strip — renders only when there's work waiting.
          Distinct from the 2×3 widget grid below: this surfaces
          INCOMING work the owner has to handle, not diagnostic
          metrics. */}
      <PendingOrdersBanner summary={pendingOrders} />

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
