import type { AISpend } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

/**
 * Tints follow the design-system semantics:
 *   ≥100% budget → brick-600 (destructive)
 *   ≥80% budget  → saffron-500 (warning highlight, sparingly)
 *   <80% budget  → teal-800 (primary fill)
 */
function fillTint(pct: number): string {
  if (pct >= 100) return "bg-brick-600";
  if (pct >= 80) return "bg-saffron-500";
  return "bg-teal-800";
}

export function AISpendMtdWidget({ spend }: { spend: AISpend }) {
  const pct =
    spend.budgetUsd > 0 ? Math.round((spend.usdSpent / spend.budgetUsd) * 100) : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <WidgetCard title="AI spend MTD">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-base tabular-nums text-bark-900">
            ${spend.usdSpent.toFixed(2)}
          </span>
          <span className="font-mono text-sm tabular-nums text-stone-500">
            / ${spend.budgetUsd.toFixed(2)}
          </span>
        </div>
        <div
          aria-label={`AI spend ${pct}% of budget`}
          className="h-2 w-full overflow-hidden rounded-full bg-husk-200"
        >
          <div
            className={`h-full ${fillTint(pct)} transition-all`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono tabular-nums">{pct}%</span>
          {pct >= 100 ? (
            <span className="text-brick-600">over budget</span>
          ) : pct >= 80 ? (
            <span className="text-clay-700">near budget</span>
          ) : (
            <span className="text-moss-600">ok</span>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
