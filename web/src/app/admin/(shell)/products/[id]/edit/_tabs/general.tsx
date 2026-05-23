"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Textarea } from "@/components/ui/textarea";
import type { AdminProductForEditing } from "@/lib/db/admin/products";
import {
  ProductEditInputSchema,
  slugifyForProduct,
  type ProductEditInput,
} from "@/lib/schemas/product";
import { saveProductGeneral } from "../actions";

/**
 * General-tab form. 14 fields, react-hook-form + Zod resolver.
 *
 * Save flow:
 *   1. Submit calls saveProductGeneral (server action).
 *   2. On ok: toast success, reset form to the saved values (so isDirty
 *      goes false), inform parent via onClean.
 *   3. On not-ok: map typed error into inline field errors (unique
 *      slug/sku, validation issues) OR a toast (constraint, not_found).
 *
 * Slug auto-derive: while the slug field is "untouched" (= user hasn't
 * typed in the slug box), edits to `name` re-derive the slug. The
 * moment the user types in slug, that ref flips and name edits stop
 * touching slug.
 */

const stockNeedsQty = (status: ProductEditInput["stock_status"]) =>
  status === "in_stock" || status === "low_stock";

function NumericInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  min,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") {
          onChange(null);
          return;
        }
        const n = Number(raw);
        onChange(Number.isFinite(n) ? Math.trunc(n) : null);
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      min={min}
    />
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-brick-600">
      {message}
    </p>
  );
}

function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-stone-500">
      {children}
    </p>
  );
}

function toDefaults(p: AdminProductForEditing): ProductEditInput {
  // Strip non-editable extras (id, category_slug) — react-hook-form
  // doesn't need them and the schema would reject them on submit.
  return {
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    short_description: p.short_description,
    description: p.description,
    base_price_inr: p.base_price_inr,
    compare_at_price_inr: p.compare_at_price_inr,
    stock_status: p.stock_status,
    stock_quantity: p.stock_quantity,
    low_stock_threshold: p.low_stock_threshold,
    allow_backorder: p.allow_backorder,
    min_order_qty: p.min_order_qty,
    max_order_qty: p.max_order_qty,
    meta_title: p.meta_title,
    meta_description: p.meta_description,
  };
}

export function GeneralTab({
  product,
  onDirty,
  onClean,
}: {
  product: AdminProductForEditing;
  onDirty: () => void;
  onClean: () => void;
}) {
  const defaults = toDefaults(product);
  const form = useForm<ProductEditInput>({
    resolver: zodResolver(ProductEditInputSchema),
    defaultValues: defaults,
    mode: "onBlur",
  });
  const {
    control,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = form;

  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Slug auto-derive: track whether the user has typed in the slug
  // input directly. The moment they do, stop deriving so manual edits
  // stick. Modeled as state (not ref) because the React Compiler's
  // refs rule rejects passing a ref-mutating callback through the form
  // register() options.
  //
  // Initial value: if the existing slug doesn't match the slugified
  // name, treat it as already-manually-set — otherwise the first render
  // would re-derive on top of the owner's prior value.
  const [slugTouched, setSlugTouched] = useState(
    slugifyForProduct(product.name) !== product.slug,
  );

  // useWatch is the React-Compiler-friendly subscription (form.watch
  // is incompatible-library-flagged). Subscribes to name only; slug is
  // read via the one-shot getValues inside the effect so we don't
  // re-fire when the slug is manually edited.
  const name = useWatch({ control, name: "name" });
  useEffect(() => {
    if (slugTouched) return;
    const derived = slugifyForProduct(name);
    if (derived && derived !== getValues("slug")) {
      setValue("slug", derived, { shouldDirty: true, shouldValidate: false });
    }
    // Only `name` matters for the derive direction; the slugTouched
    // guard is the once-only switch and getValues is a one-shot read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, slugTouched]);

  // Tell the parent dirty-guard whenever the form's dirtiness flips.
  useEffect(() => {
    if (isDirty) onDirty();
    else onClean();
  }, [isDirty, onDirty, onClean]);

  const stockStatus = useWatch({ control, name: "stock_status" });
  const showStockQty = stockNeedsQty(stockStatus);

  // Mark slug as user-touched on first edit. Idempotent — once true,
  // setSlugTouched(true) is a no-op.
  const markSlugTouched = useCallback(() => setSlugTouched(true), []);

  const onSubmit: SubmitHandler<ProductEditInput> = useCallback(
    (values) => {
      setSubmitError(null);
      startTransition(async () => {
        const result = await saveProductGeneral(product.id, values);
        if (result.ok) {
          toast.success("Product saved");
          // reset the form's "clean" baseline to the saved values so
          // isDirty goes false; passing the same values keeps the UI.
          reset(values);
          onClean();
          return;
        }
        if (result.error.code === "validation") {
          for (const issue of result.error.issues) {
            const path = issue.path[0] as keyof ProductEditInput | undefined;
            if (path) {
              setError(path, { type: "server", message: issue.message });
            }
          }
          setSubmitError("Some fields need attention");
          return;
        }
        if (result.error.code === "slug_in_use") {
          setError("slug", { type: "server", message: "Slug already in use" });
          setSubmitError("Slug is taken");
          return;
        }
        if (result.error.code === "sku_in_use") {
          setError("sku", { type: "server", message: "SKU already in use" });
          setSubmitError("SKU is taken");
          return;
        }
        if (result.error.code === "constraint") {
          toast.error("Database rejected the change", {
            description: result.error.message,
          });
          setSubmitError(result.error.message);
          return;
        }
        if (result.error.code === "not_found") {
          toast.error("Product not found", {
            description: "It may have been deleted in another tab. Refresh.",
          });
          return;
        }
      });
    },
    [product.id, reset, setError, onClean],
  );

  const busy = isPending || isSubmitting;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 pb-24"
      noValidate
    >
      {/* ─── Identity ────────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Identity
        </legend>

        <div className="space-y-2">
          <Label htmlFor="general-name">Name</Label>
          <Input
            id="general-name"
            {...register("name")}
            aria-invalid={!!errors.name}
            aria-describedby="general-name-hint"
            disabled={busy}
          />
          <Hint id="general-name-hint">
            Customer-facing. Shows on the PDP H1 and in search results.
          </Hint>
          <FieldError message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="general-slug">Slug</Label>
          <Input
            id="general-slug"
            {...register("slug", { onChange: markSlugTouched })}
            aria-invalid={!!errors.slug}
            aria-describedby="general-slug-hint"
            className="font-mono"
            disabled={busy}
          />
          <Hint id="general-slug-hint">
            URL fragment, lowercase letters / digits / dashes. Auto-derived
            from the name until you edit it.
          </Hint>
          <FieldError message={errors.slug?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="general-sku">SKU</Label>
          <Input
            id="general-sku"
            {...register("sku")}
            aria-invalid={!!errors.sku}
            aria-describedby="general-sku-hint"
            className="font-mono"
            disabled={busy}
          />
          <Hint id="general-sku-hint">
            Internal stock-keeping unit. Uppercase letters, digits, and dashes.
          </Hint>
          <FieldError message={errors.sku?.message} />
        </div>
      </fieldset>

      {/* ─── Descriptions ────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Descriptions
        </legend>

        <div className="space-y-2">
          <Label htmlFor="general-short">Short description</Label>
          <Controller
            control={control}
            name="short_description"
            render={({ field }) => (
              <Textarea
                id="general-short"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
                onBlur={field.onBlur}
                rows={2}
                aria-invalid={!!errors.short_description}
                aria-describedby="general-short-hint"
                disabled={busy}
              />
            )}
          />
          <Hint id="general-short-hint">
            Up to 280 chars. Shows on product cards and the first line of the
            PDP.
          </Hint>
          <FieldError message={errors.short_description?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="general-desc">Description</Label>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <MarkdownEditor
                id="general-desc"
                value={field.value ?? ""}
                onChange={(v) => field.onChange(v || null)}
                onBlur={field.onBlur}
                ariaDescribedBy="general-desc-hint"
              />
            )}
          />
          <Hint id="general-desc-hint">
            Markdown. The preview matches storefront rendering (sanitized).
          </Hint>
          <FieldError message={errors.description?.message} />
        </div>
      </fieldset>

      {/* ─── Pricing ────────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Pricing
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="general-base-price">Base price (₹)</Label>
            <Controller
              control={control}
              name="base_price_inr"
              render={({ field }) => (
                <NumericInput
                  id="general-base-price"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  min={0}
                />
              )}
            />
            <FieldError message={errors.base_price_inr?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="general-compare-price">Compare-at price (₹)</Label>
            <Controller
              control={control}
              name="compare_at_price_inr"
              render={({ field }) => (
                <NumericInput
                  id="general-compare-price"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  min={0}
                />
              )}
            />
            <Hint id="general-compare-price-hint">
              Optional. If set, must be greater than the base price.
            </Hint>
            <FieldError message={errors.compare_at_price_inr?.message} />
          </div>
        </div>
      </fieldset>

      {/* ─── Stock ─────────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Stock
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="general-stock-status">Stock status</Label>
            <select
              id="general-stock-status"
              className="h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30"
              {...register("stock_status")}
              disabled={busy}
            >
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="made_to_order">Made to order</option>
              <option value="unknown">Unknown</option>
            </select>
            <FieldError message={errors.stock_status?.message} />
          </div>

          {showStockQty ? (
            <div className="space-y-2">
              <Label htmlFor="general-stock-qty">Stock quantity</Label>
              <Controller
                control={control}
                name="stock_quantity"
                render={({ field }) => (
                  <NumericInput
                    id="general-stock-qty"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    min={0}
                  />
                )}
              />
              <FieldError message={errors.stock_quantity?.message} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="general-low-stock">Low-stock threshold</Label>
            <Controller
              control={control}
              name="low_stock_threshold"
              render={({ field }) => (
                <Input
                  id="general-low-stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError message={errors.low_stock_threshold?.message} />
          </div>

          <div className="flex items-end gap-2 pb-2">
            <input
              id="general-allow-backorder"
              type="checkbox"
              className="size-4 accent-teal-800"
              {...register("allow_backorder")}
            />
            <Label htmlFor="general-allow-backorder" className="cursor-pointer">
              Allow back-orders when out of stock
            </Label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="general-min-qty">Min order qty</Label>
            <Controller
              control={control}
              name="min_order_qty"
              render={({ field }) => (
                <Input
                  id="general-min-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value) || 1)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError message={errors.min_order_qty?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="general-max-qty">Max order qty</Label>
            <Controller
              control={control}
              name="max_order_qty"
              render={({ field }) => (
                <NumericInput
                  id="general-max-qty"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  min={1}
                  placeholder="No cap"
                />
              )}
            />
            <Hint id="general-max-qty-hint">
              Optional. Defaults to unlimited.
            </Hint>
            <FieldError message={errors.max_order_qty?.message} />
          </div>
        </div>
      </fieldset>

      {/* ─── SEO ───────────────────────────────────────────────── */}
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          SEO
        </legend>

        <div className="space-y-2">
          <Label htmlFor="general-meta-title">Meta title</Label>
          <Controller
            control={control}
            name="meta_title"
            render={({ field }) => (
              <Input
                id="general-meta-title"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
                onBlur={field.onBlur}
                placeholder="Defaults to the product name"
                maxLength={60}
              />
            )}
          />
          <Hint id="general-meta-title-hint">≤ 60 chars.</Hint>
          <FieldError message={errors.meta_title?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="general-meta-desc">Meta description</Label>
          <Controller
            control={control}
            name="meta_description"
            render={({ field }) => (
              <Textarea
                id="general-meta-desc"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
                onBlur={field.onBlur}
                rows={2}
                placeholder="Shown on search-engine result snippets"
                maxLength={160}
              />
            )}
          />
          <Hint id="general-meta-desc-hint">≤ 160 chars.</Hint>
          <FieldError message={errors.meta_description?.message} />
        </div>
      </fieldset>

      {/* ─── Sticky save bar ─────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-husk-200 bg-paper-0/95 backdrop-blur supports-backdrop-filter:bg-paper-0/80 md:left-56">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="min-w-0 text-sm text-stone-500">
            {submitError ? (
              <span className="text-brick-600">{submitError}</span>
            ) : isDirty ? (
              <span>Unsaved changes</span>
            ) : (
              <span>All changes saved</span>
            )}
          </div>
          <Button
            type="submit"
            disabled={busy || !isDirty}
            className="shrink-0"
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
