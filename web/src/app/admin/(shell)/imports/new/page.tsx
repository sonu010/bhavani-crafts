import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New import",
  robots: { index: false, follow: false },
};

const REQUIRED_COLS = ["sku", "name", "base_price_inr"];
const OPTIONAL_COLS = [
  "slug",
  "short_description",
  "description",
  "compare_at_price_inr",
  "stock_status",
  "stock_quantity",
  "category_slug",
  "tags",
];

export default function NewImportPage() {
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/imports"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Imports
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="font-medium text-bark-900">New</span>
      </nav>

      <header className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <h1 className="font-display text-xl text-bark-900">New CSV import</h1>
        <p className="mt-1 text-sm text-stone-500">
          Two-step: upload validates first (no catalog changes). Inspect the
          preview, then click Run import on the next page to apply.
        </p>
      </header>

      <fieldset className="space-y-2 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          CSV columns
        </legend>
        <p className="text-sm text-bark-900">
          Required:{" "}
          {REQUIRED_COLS.map((c, i) => (
            <span key={c}>
              {i > 0 ? ", " : ""}
              <code className="rounded bg-husk-100 px-1.5 py-0.5 font-mono text-xs">
                {c}
              </code>
            </span>
          ))}
        </p>
        <p className="text-sm text-stone-600">
          Optional:{" "}
          {OPTIONAL_COLS.map((c, i) => (
            <span key={c}>
              {i > 0 ? ", " : ""}
              <code className="rounded bg-husk-100 px-1.5 py-0.5 font-mono text-xs">
                {c}
              </code>
            </span>
          ))}
        </p>
        <p className="text-xs text-stone-500">
          UTF-8 (BOM ok). Comma-separated. Use{" "}
          <code className="font-mono">tags</code> with a comma-delimited list
          of tag slugs. Max 20 MB.
        </p>
      </fieldset>

      <UploadForm />
    </div>
  );
}
