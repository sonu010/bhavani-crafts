"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminProductBasic } from "@/lib/db/products";
import { AttributesTab } from "./_tabs/attributes";
import { CategoryTab } from "./_tabs/category";
import { GeneralTab } from "./_tabs/general";
import { ImagesTab } from "./_tabs/images";
import { PublishTab } from "./_tabs/publish";
import { VariantsTab } from "./_tabs/variants";
import { TABS, isEditorTab, type EditorTab } from "./tabs-config";
import { useDirtyGuard } from "./use-dirty-guard";

/**
 * Tabbed editor. Active tab lives in the `?tab=` query param — server
 * component reads it for initial render, this client component swaps it
 * via `router.replace` on tab change. Deep-linking + back-button work
 * for free.
 *
 * The dirty-guard hook gates `beforeunload`. Per-tab auto-save (lands
 * in T11+) means a tab switch doesn't need to prompt — the leaving tab
 * is already persisted by the time it unmounts.
 */
export function ProductEditor({
  product,
  initialTab,
  backHref,
}: {
  product: AdminProductBasic;
  initialTab: EditorTab;
  backHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // markDirty / markClean will be prop-drilled into tab components in
  // P2-T11+ (auto-save). Pulling only `isDirty` here keeps the editor
  // shell visibly using the guard hook now; the rest wires in then.
  const { isDirty } = useDirtyGuard();

  const onTabChange = useCallback(
    (value: string | number | null) => {
      if (typeof value !== "string" || !isEditorTab(value)) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", value);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-4">
      {/* Breadcrumb. The "back" target preserves the user's prior filters
         when the list page set ?back= on the row's edit link. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Products
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="truncate font-medium text-bark-900" title={product.name}>
          {product.name}
        </span>
        {isDirty ? (
          <span
            aria-label="unsaved changes"
            className="ml-1 rounded-full bg-saffron-500/15 px-2 py-0.5 font-mono text-xs text-clay-700"
          >
            unsaved
          </span>
        ) : null}
      </nav>

      <Tabs value={initialTab} onValueChange={onTabChange}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="category">
          <CategoryTab />
        </TabsContent>
        <TabsContent value="attributes">
          <AttributesTab />
        </TabsContent>
        <TabsContent value="variants">
          <VariantsTab />
        </TabsContent>
        <TabsContent value="images">
          <ImagesTab />
        </TabsContent>
        <TabsContent value="publish">
          <PublishTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
