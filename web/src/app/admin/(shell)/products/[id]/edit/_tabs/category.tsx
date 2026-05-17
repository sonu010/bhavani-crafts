"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  AdminProductForEditing,
  CategoryBadge,
} from "@/lib/db/admin/products";
import type { CategoryTreeNode } from "@/lib/schemas/category";
import { saveProductCategory, saveProductTags } from "../actions";
import { CategoryPicker } from "../_pickers/category-picker";
import { TagsPicker } from "../_pickers/tags-picker";

/**
 * Two sections — Category (single-select) and Tags (multi-select).
 *
 * They save independently per the task spec: each has its own button
 * and writes its own audit log entry. Both sections share the parent
 * dirty-guard — onDirty fires when either is dirty.
 */
export function CategoryTab({
  product,
  categoryTree,
  allTags,
  currentTags,
  onDirty,
  onClean,
}: {
  product: AdminProductForEditing;
  categoryTree: CategoryTreeNode[];
  allTags: Array<{ slug: string; name: string }>;
  currentTags: CategoryBadge[];
  onDirty: () => void;
  onClean: () => void;
}) {
  // ─── Category section ───────────────────────────────────────────
  const initialCategoryId = product.category_id;
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const categoryDirty = categoryId !== initialCategoryId;

  // Flat list for resolving id → name in the picker trigger.
  const flatCategories = useMemo(() => {
    const out: Array<{ id: string; name: string }> = [];
    const walk = (nodes: CategoryTreeNode[]) => {
      for (const n of nodes) {
        out.push({ id: n.id, name: n.name });
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(categoryTree);
    return out;
  }, [categoryTree]);

  const currentCategoryDisplay = useMemo(() => {
    if (!categoryId) return null;
    const found = flatCategories.find((c) => c.id === categoryId);
    return found ?? { id: categoryId, name: "(unknown category)" };
  }, [categoryId, flatCategories]);

  // ─── Tags section ───────────────────────────────────────────────
  const initialTagSlugs = useMemo(
    () => currentTags.map((t) => t.slug).sort(),
    [currentTags],
  );
  const [tagSlugs, setTagSlugs] = useState<string[]>(initialTagSlugs);

  const tagsDirty = useMemo(() => {
    const a = tagSlugs.slice().sort();
    const b = initialTagSlugs;
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }, [tagSlugs, initialTagSlugs]);

  // Combined dirty bubbling.
  useEffect(() => {
    if (categoryDirty || tagsDirty) onDirty();
    else onClean();
  }, [categoryDirty, tagsDirty, onDirty, onClean]);

  // ─── Save handlers ──────────────────────────────────────────────
  const [savingCategory, startCategorySave] = useTransition();
  const [savingTags, startTagsSave] = useTransition();

  // Bake the "saved" baseline locally so re-rendering after success
  // resets the dirty state without a refetch from the server.
  const [savedCategoryId, setSavedCategoryId] = useState(initialCategoryId);
  const [savedTagSlugs, setSavedTagSlugs] = useState(initialTagSlugs);
  // Re-derive dirty against the savedX baseline once it advances.
  const categoryActuallyDirty = categoryId !== savedCategoryId;
  const tagsActuallyDirty = useMemo(() => {
    const a = tagSlugs.slice().sort();
    if (a.length !== savedTagSlugs.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== savedTagSlugs[i]) return true;
    return false;
  }, [tagSlugs, savedTagSlugs]);

  const onSaveCategory = useCallback(() => {
    startCategorySave(async () => {
      const r = await saveProductCategory(product.id, categoryId);
      if (r.ok) {
        toast.success("Category saved");
        setSavedCategoryId(categoryId);
        return;
      }
      if (r.error.code === "category_not_found") {
        toast.error("That category no longer exists. Refresh and retry.");
      } else if (r.error.code === "not_found") {
        toast.error("Product no longer exists. Refresh.");
      }
    });
  }, [product.id, categoryId]);

  const onSaveTags = useCallback(() => {
    startTagsSave(async () => {
      const r = await saveProductTags(product.id, tagSlugs);
      if (r.ok) {
        toast.success("Tags saved");
        setSavedTagSlugs(tagSlugs.slice().sort());
        return;
      }
      if (r.error.code === "tag_not_found") {
        toast.error(
          `Tag not found: ${r.error.missingSlugs.join(", ")}. Refresh.`,
        );
      }
    });
  }, [product.id, tagSlugs]);

  // Re-evaluate parent dirty bubble against the savedX baselines so
  // the bar goes clean after a successful save.
  useEffect(() => {
    if (categoryActuallyDirty || tagsActuallyDirty) onDirty();
    else onClean();
  }, [categoryActuallyDirty, tagsActuallyDirty, onDirty, onClean]);

  return (
    <div className="space-y-6 pb-24">
      {/* ─── Category ──────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Category
        </legend>

        <div className="space-y-2">
          <Label htmlFor="category-picker">
            Where does this product belong?
          </Label>
          <CategoryPicker
            tree={categoryTree}
            value={currentCategoryDisplay}
            onChange={setCategoryId}
            disabled={savingCategory}
          />
          <p className="text-xs text-stone-500">
            Picking &ldquo;No category&rdquo; leaves the product visible only
            via search + tags.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-husk-200 pt-3 text-sm">
          <span className="text-stone-500">
            {categoryActuallyDirty ? "Category changed" : "Saved"}
          </span>
          <Button
            type="button"
            onClick={onSaveCategory}
            disabled={!categoryActuallyDirty || savingCategory}
          >
            {savingCategory ? "Saving…" : "Save category"}
          </Button>
        </div>
      </fieldset>

      {/* ─── Tags ──────────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Tags
        </legend>

        <div className="space-y-2">
          <Label htmlFor="tags-picker">Tags</Label>
          <TagsPicker
            options={allTags}
            value={tagSlugs}
            onChange={setTagSlugs}
            disabled={savingTags}
          />
          <p className="text-xs text-stone-500">
            Tags appear on the storefront and power the related-products
            sidebar. Pick zero or more.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-husk-200 pt-3 text-sm">
          <span className="text-stone-500">
            {tagsActuallyDirty
              ? `${tagSlugs.length} selected, unsaved`
              : `${tagSlugs.length} selected, saved`}
          </span>
          <Button
            type="button"
            onClick={onSaveTags}
            disabled={!tagsActuallyDirty || savingTags}
          >
            {savingTags ? "Saving…" : "Save tags"}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
