"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AttributeDefinitionInputSchema,
  type AttributeDefinitionInput,
  slugifyForAttribute,
} from "@/lib/schemas/attribute";
import type { CategoryTreeNode } from "@/lib/schemas/category";
import { createAttributeAction, updateAttributeAction } from "./actions";

interface FlatNode {
  id: string;
  name: string;
  depth: number;
}

function flatten(
  nodes: CategoryTreeNode[],
  depth = 0,
  out: FlatNode[] = [],
): FlatNode[] {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children.length > 0) flatten(n.children, depth + 1, out);
  }
  return out;
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * Shared create + edit form. Conditional rendering based on `type`:
 *   - `unit` field visible for `number`
 *   - `options_json` chips visible for `select`
 *
 * Slug auto-derives from name until manually edited.
 * Options are stored as `string[]` in the form; submission preserves
 * the order. Duplicates and empty strings are stripped before
 * validation.
 */
export function AttributeForm({
  mode,
  attributeId,
  initial,
  categoryTree,
  existingProductValueCount,
}: {
  mode: "create" | "edit";
  attributeId?: string;
  initial: AttributeDefinitionInput;
  categoryTree: CategoryTreeNode[];
  /** Used to disable the type field on edit when values exist. */
  existingProductValueCount?: number;
}) {
  const router = useRouter();
  const [isPending, startSave] = useTransition();
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [optionDraft, setOptionDraft] = useState("");
  const [options, setOptions] = useState<string[]>(initial.options_json ?? []);

  const form = useForm<AttributeDefinitionInput>({
    resolver: zodResolver(AttributeDefinitionInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    setError,
    control,
  } = form;

  const nameWatch = useWatch({ control, name: "name" });
  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugifyForAttribute(nameWatch ?? ""), {
      shouldDirty: true,
    });
  }, [nameWatch, slugTouched, setValue]);

  // Keep the form's options_json in sync with local chips list. On
  // submit we read from `options` directly to avoid a stale read.
  useEffect(() => {
    setValue("options_json", options.length > 0 ? options : null, {
      shouldDirty: true,
    });
  }, [options, setValue]);

  const typeWatch = useWatch({ control, name: "type" });
  const flatCats = useMemo(() => flatten(categoryTree), [categoryTree]);
  const typeChangeLocked =
    mode === "edit" && (existingProductValueCount ?? 0) > 0;

  const addOption = useCallback(() => {
    const v = optionDraft.trim();
    if (!v) return;
    if (options.some((o) => o.toLowerCase() === v.toLowerCase())) {
      toast.error("Already in the list");
      return;
    }
    setOptions((prev) => [...prev, v]);
    setOptionDraft("");
  }, [optionDraft, options]);

  const removeOption = useCallback((idx: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onSubmit = useCallback(
    (values: AttributeDefinitionInput) => {
      startSave(async () => {
        // Snap options into the payload from the chips state.
        const payload: AttributeDefinitionInput = {
          ...values,
          options_json:
            values.type === "select"
              ? options.length > 0
                ? options
                : null
              : null,
          // Number-only field — clear unit for non-number types.
          unit: values.type === "number" ? (values.unit?.trim() || null) : null,
        };

        const r =
          mode === "create"
            ? await createAttributeAction(payload)
            : await updateAttributeAction(attributeId!, payload);

        if (r.ok) {
          toast.success(mode === "create" ? "Attribute created" : "Saved");
          if (mode === "create" && "id" in r) {
            router.push(`/admin/attributes/${r.id}/edit`);
            return;
          }
        } else {
          if (r.error.code === "validation") {
            for (const i of r.error.issues) {
              setError(i.path[0] as keyof AttributeDefinitionInput, {
                type: "server",
                message: i.message,
              });
            }
            toast.error("Some fields need attention");
          } else if (r.error.code === "slug_in_use") {
            setError("slug", { type: "server", message: "Slug already in use" });
            toast.error("Slug already in use");
          } else if (r.error.code === "category_not_found") {
            setError("applies_to_category_id", {
              type: "server",
              message: "Category not found",
            });
            toast.error("Category not found");
          } else if (r.error.code === "type_change_blocked") {
            setError("type", {
              type: "server",
              message: `Cannot change type — ${r.error.productValueCount} product values exist`,
            });
            toast.error("Cannot change type while values exist");
          } else if (r.error.code === "not_found") {
            toast.error("Attribute not found");
          }
        }
      });
    },
    [mode, attributeId, options, router, setError],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 pb-24"
      noValidate
    >
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Basics
        </legend>

        <Field label="Name" error={errors.name?.message}>
          <Input
            {...register("name")}
            aria-invalid={!!errors.name}
            autoFocus={mode === "create"}
          />
        </Field>

        <Field label="Slug" error={errors.slug?.message}>
          <Input
            {...register("slug", { onChange: () => setSlugTouched(true) })}
            aria-invalid={!!errors.slug}
            className="font-mono text-sm"
          />
        </Field>

        <Field
          label="Type"
          error={errors.type?.message}
          hint={
            typeChangeLocked
              ? `Locked — ${existingProductValueCount} product values exist.`
              : "Affects which value column is used and how the editor renders the field."
          }
        >
          <select
            {...register("type")}
            className={SELECT_CLASS}
            disabled={typeChangeLocked}
            aria-invalid={!!errors.type}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="select">Select (single-choice)</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Type-specific
        </legend>

        {typeWatch === "number" ? (
          <Field
            label="Unit"
            error={errors.unit?.message}
            hint="Suffix shown next to the number on the storefront, e.g. ml, gsm, mm."
          >
            <Input
              {...register("unit", {
                setValueAs: (v: string) => v?.trim() || null,
              })}
              aria-invalid={!!errors.unit}
              className="w-32"
            />
          </Field>
        ) : null}

        {typeWatch === "select" ? (
          <Field
            label="Options"
            error={errors.options_json?.message}
            hint="At least one. Press Enter or click Add."
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {options.map((opt, idx) => (
                  <span
                    key={`${opt}-${idx}`}
                    className="inline-flex items-center gap-1 rounded-full border border-husk-200 bg-paper-50 px-2.5 py-1 text-xs"
                  >
                    <span className="text-bark-900">{opt}</span>
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="text-stone-500 hover:text-brick-600"
                      aria-label={`Remove ${opt}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    value={optionDraft}
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    placeholder="Add option"
                    className="h-8 w-40 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    disabled={!optionDraft.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
              {options.length === 0 ? (
                <p className="text-xs text-stone-500">
                  No options yet. Press Enter after typing each one.
                </p>
              ) : null}
            </div>
          </Field>
        ) : null}

        {typeWatch !== "number" && typeWatch !== "select" ? (
          <p className="text-xs text-stone-500">
            No type-specific fields for{" "}
            <span className="font-mono">{typeWatch}</span> attributes.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Scope + display
        </legend>

        <Field
          label="Applies to category"
          error={errors.applies_to_category_id?.message}
          hint="Leave empty for a global attribute (visible on every product)."
        >
          <select
            {...register("applies_to_category_id", {
              setValueAs: (v: string) => (v === "" ? null : v),
            })}
            className={SELECT_CLASS}
            aria-invalid={!!errors.applies_to_category_id}
          >
            <option value="">(global)</option>
            {flatCats.map((c) => (
              <option key={c.id} value={c.id}>
                {"— ".repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register("is_filterable")}
            className="size-4 accent-teal-800"
          />
          <span className="text-bark-900">
            Show as a storefront filter on category pages
          </span>
        </label>

        <Field
          label="Sort order"
          error={errors.sort_order?.message}
          hint="Lower = earlier in the product editor's attribute list."
        >
          <Input
            type="number"
            inputMode="numeric"
            {...register("sort_order", { valueAsNumber: true })}
            aria-invalid={!!errors.sort_order}
            className="w-32"
          />
        </Field>
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-husk-200 bg-paper-0/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          href="/admin/attributes"
          className="text-sm text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-bark-900">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-brick-600">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}
