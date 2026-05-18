"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminProductForEditing,
  CategoryBadge,
} from "@/lib/db/admin/products";
import type {
  AttributeDefinition,
  ProductAttributeRow,
} from "@/lib/db/attributes";
import type { ProductImageRow } from "@/lib/db/admin/images";
import type { VariantsBundle } from "@/lib/db/admin/variants";
import type { CategoryTreeNode } from "@/lib/schemas/category";
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
  categoryTree,
  allTags,
  currentTags,
  attributeDefs,
  attributeValues,
  variantsBundle,
  images,
  initialTab,
  backHref,
}: {
  product: AdminProductForEditing;
  categoryTree: CategoryTreeNode[];
  allTags: Array<{ slug: string; name: string }>;
  currentTags: CategoryBadge[];
  attributeDefs: AttributeDefinition[];
  attributeValues: ProductAttributeRow[];
  variantsBundle: VariantsBundle;
  images: ProductImageRow[];
  initialTab: EditorTab;
  backHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDirty, markDirty, markClean } = useDirtyGuard();

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
        {/* Mobile: native select. Drops the row-eating tab strip to a
           single line that scales down to ~280px without overflow.
           Desktop (sm+): horizontal tab strip with the "line" variant
           — underline-only, no pill background. */}
        <label className="sm:hidden">
          <span className="sr-only">Section</span>
          <select
            value={initialTab}
            onChange={(e) => onTabChange(e.target.value)}
            className="h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-sm font-medium text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30"
          >
            {TABS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <TabsList
          variant="line"
          className="hidden w-fit justify-start sm:inline-flex"
        >
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <GeneralTab
            product={product}
            onDirty={markDirty}
            onClean={markClean}
          />
        </TabsContent>
        <TabsContent value="category">
          <CategoryTab
            product={product}
            categoryTree={categoryTree}
            allTags={allTags}
            currentTags={currentTags}
            onDirty={markDirty}
            onClean={markClean}
          />
        </TabsContent>
        <TabsContent value="attributes">
          <AttributesTab
            productId={product.id}
            categorySlug={product.category_slug}
            definitions={attributeDefs}
            initialValues={attributeValues}
            onDirty={markDirty}
            onClean={markClean}
          />
        </TabsContent>
        <TabsContent value="variants">
          <VariantsTab
            productId={product.id}
            productSku={product.sku ?? ""}
            initialBundle={variantsBundle}
            onDirty={markDirty}
            onClean={markClean}
          />
        </TabsContent>
        <TabsContent value="images">
          <ImagesTab productId={product.id} initialImages={images} />
        </TabsContent>
        <TabsContent value="publish">
          <PublishTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
