"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  OptionInput,
  VariantInput,
  VariantsBundle,
} from "@/lib/db/admin/variants";
import {
  generateAllVariantsAction,
  saveProductOptions,
  saveProductVariants,
  setDefaultVariantAction,
  softDeleteVariantAction,
} from "../actions";
import { OptionsEditor } from "../_variants/options-editor";
import { VariantsTable, type VariantDraft } from "../_variants/variants-table";

/**
 * Variants tab. Composes OptionsEditor + VariantsTable + Generate-all.
 *
 * Three independent save tracks:
 *   - Options: replace-semantics over options + values.
 *   - Variants: per-row updates (price/SKU/stock).
 *   - Default + soft-delete: eager mutations with their own actions.
 *
 * Initial state comes from the server-fetched bundle. After each
 * mutation we either patch local draft (default/soft-delete) or
 * full-reload to pull the server's after-state (generate adds new
 * rows we don't know the ids of).
 */
export function VariantsTab({
  productId,
  initialBundle,
  onDirty,
  onClean,
}: {
  productId: string;
  productSku: string;
  initialBundle: VariantsBundle;
  onDirty: () => void;
  onClean: () => void;
}) {
  const initialOptions = useMemo<OptionInput[]>(
    () =>
      initialBundle.options.map((o) => ({
        id: o.id,
        name: o.name,
        sort_order: o.sort_order,
        values: o.values.map((v) => ({
          id: v.id,
          value: v.value,
          sort_order: v.sort_order,
        })),
      })),
    [initialBundle.options],
  );

  const [options, setOptions] = useState<OptionInput[]>(initialOptions);
  const [savedOptions, setSavedOptions] = useState<OptionInput[]>(initialOptions);

  const [variants, setVariants] = useState<VariantDraft[]>(initialBundle.variants);
  const [savedVariants, setSavedVariants] = useState<VariantDraft[]>(
    initialBundle.variants,
  );

  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [savingOpts, startSaveOpts] = useTransition();
  const [savingVars, startSaveVars] = useTransition();
  const [generating, startGenerate] = useTransition();

  const optionsDirty = useMemo(
    () => JSON.stringify(options) !== JSON.stringify(savedOptions),
    [options, savedOptions],
  );
  const variantsDirty = useMemo(
    () => JSON.stringify(variants) !== JSON.stringify(savedVariants),
    [variants, savedVariants],
  );

  const dirty = optionsDirty || variantsDirty;

  useEffect(() => {
    if (dirty) onDirty();
    else onClean();
  }, [dirty, onDirty, onClean]);

  const onSaveOptions = useCallback(() => {
    startSaveOpts(async () => {
      for (const o of options) {
        if (!o.name.trim()) {
          toast.error("Option name is required");
          return;
        }
        if (o.values.length === 0) {
          toast.error(`Option "${o.name}" needs at least one value`);
          return;
        }
      }
      const r = await saveProductOptions(productId, options);
      if (r.ok) {
        toast.success("Options saved");
        setSavedOptions(options);
        return;
      }
      switch (r.error.code) {
        case "duplicate_option_name":
          toast.error(`Duplicate option name: ${r.error.name}`);
          break;
        case "duplicate_value":
          toast.error(
            `Duplicate value "${r.error.value}" on option "${r.error.option}"`,
          );
          break;
        case "value_in_use":
          toast.error(
            `${r.error.variantCount} variant(s) depend on a value being removed. Soft-delete those variants first.`,
          );
          break;
        case "validation":
          toast.error(
            `Validation: ${r.error.issues.map((i) => i.message).join(", ")}`,
          );
          break;
        default:
          toast.error("Save failed");
      }
    });
  }, [productId, options]);

  const onSaveVariants = useCallback(() => {
    startSaveVars(async () => {
      const payload: VariantInput[] = variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        price_inr: v.price_inr,
        compare_at_price_inr: v.compare_at_price_inr,
        stock_status: v.stock_status,
        stock_quantity: v.stock_quantity,
        sort_order: v.sort_order,
        option_value_ids: v.option_value_ids,
      }));
      const r = await saveProductVariants(productId, payload);
      if (r.ok) {
        toast.success("Variants saved");
        setSavedVariants(variants);
        return;
      }
      switch (r.error.code) {
        case "sku_in_use":
          toast.error(`SKU already in use: ${r.error.sku}`);
          break;
        case "duplicate_combo":
          toast.error("Two variants share the same option combination");
          break;
        case "validation":
          toast.error(
            `Validation: ${r.error.issues
              .map((i) => `${i.path} — ${i.message}`)
              .join(", ")}`,
          );
          break;
        default:
          toast.error("Save failed");
      }
    });
  }, [productId, variants]);

  const onGenerate = useCallback(() => {
    startGenerate(async () => {
      const r = await generateAllVariantsAction(productId);
      if (r.ok) {
        if (r.created === 0) toast.info("No new variants to generate");
        else
          toast.success(
            `Generated ${r.created} variant${r.created === 1 ? "" : "s"}`,
          );
        // The server is now ahead of our local cache. New variants have
        // server-assigned ids we don't know — reload to pull them.
        window.location.reload();
        return;
      }
      switch (r.error.code) {
        case "no_options":
          toast.error("Add at least one option (with values) first");
          break;
        case "validation":
          toast.error(
            r.error.issues.map((i) => i.message).join(", ") || "Validation failed",
          );
          break;
        default:
          toast.error("Generate failed");
      }
    });
  }, [productId]);

  const onSetDefault = useCallback(
    (variantId: string) => {
      setPendingVariantId(variantId);
      (async () => {
        const r = await setDefaultVariantAction(productId, variantId);
        setPendingVariantId(null);
        if (r.ok) {
          toast.success("Default variant updated");
          const flip = (rows: VariantDraft[]) =>
            rows.map((v) => ({ ...v, is_default: v.id === variantId }));
          setVariants(flip);
          setSavedVariants(flip);
        } else {
          toast.error("Could not set default");
        }
      })();
    },
    [productId],
  );

  const onSoftDelete = useCallback(
    (variantId: string) => {
      if (!window.confirm("Soft-delete this variant? It will move to Trash."))
        return;
      setPendingVariantId(variantId);
      (async () => {
        const r = await softDeleteVariantAction(productId, variantId);
        setPendingVariantId(null);
        if (r.ok) {
          toast.success("Variant moved to Trash");
          setVariants((rows) => rows.filter((v) => v.id !== variantId));
          setSavedVariants((rows) => rows.filter((v) => v.id !== variantId));
        } else {
          toast.error("Could not delete variant");
        }
      })();
    },
    [productId],
  );

  const canGenerate =
    options.length > 0 && options.every((o) => o.values.length > 0);

  return (
    <div className="space-y-6 pb-24">
      <OptionsEditor
        options={options}
        onChange={setOptions}
        disabled={savingOpts}
      />

      <div className="flex items-center justify-between gap-3 rounded-lg border border-husk-200 bg-paper-0 p-3 text-sm">
        <div className="text-stone-500">
          {optionsDirty ? "Options changed — save first" : "Options up to date"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onGenerate}
            disabled={!canGenerate || optionsDirty || generating}
            title={
              optionsDirty
                ? "Save options before generating"
                : !canGenerate
                  ? "Add at least one option with values"
                  : "Generate the full Cartesian product of variants"
            }
          >
            <Sparkles className="size-4" />
            {generating ? "Generating…" : "Generate all variants"}
          </Button>
          <Button
            type="button"
            onClick={onSaveOptions}
            disabled={!optionsDirty || savingOpts}
          >
            {savingOpts ? "Saving…" : "Save options"}
          </Button>
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Variants
        </legend>

        <VariantsTable
          options={initialBundle.options}
          variants={variants}
          onChange={setVariants}
          onSetDefault={onSetDefault}
          onSoftDelete={onSoftDelete}
          disabled={savingVars}
          pendingId={pendingVariantId}
        />

        <div className="flex items-center justify-between gap-3 border-t border-husk-200 pt-3 text-sm">
          <span className="text-stone-500">
            {variantsDirty ? "Unsaved variant edits" : "All variants saved"}
          </span>
          <Button
            type="button"
            onClick={onSaveVariants}
            disabled={!variantsDirty || savingVars}
          >
            {savingVars ? "Saving…" : "Save variants"}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
