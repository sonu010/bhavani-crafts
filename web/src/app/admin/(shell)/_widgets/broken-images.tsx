import Link from "next/link";
import { WidgetCard } from "./widget-card";

export function BrokenImagesWidget({ count }: { count: number }) {
  return (
    <WidgetCard title="Broken images">
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl tabular-nums text-bark-900">
            {count}
          </span>
          <span className="text-sm text-stone-500">
            disputed&nbsp;/&nbsp;removed
          </span>
        </div>
        {count > 0 ? (
          <Link
            href="/admin/products?status=all&images=problem"
            className="text-xs text-teal-800 underline-offset-2 hover:underline"
          >
            Review →
          </Link>
        ) : null}
      </div>
    </WidgetCard>
  );
}
