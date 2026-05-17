"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  AttributeDefinition,
  ProductAttributeRow,
} from "@/lib/db/attributes";
import type { AttributeValueInput } from "@/lib/db/admin/products";
import { AttributeInput, type AttributeValue } from "../_attrs/attribute-input";
import { saveProductAttributes } from "../actions";

/** Empty value sentinel for a fresh attribute slot. */
const EMPTY: AttributeValue = {
  value_text: null,
  value_number: null,
  value_boolean: null,
};

function valuesEqual(a: AttributeValue, b: AttributeValue): boolean {
  return (
    a.value_text === b.value_text &&
    a.value_number === b.value_number &&
    a.value_boolean === b.value_boolean
  );
}

function isEmpty(v: AttributeValue): boolean {
  return (
    (v.value_text == null || v.value_text === "") &&
    v.value_number == null &&
    v.value_boolean == null
  );
}

export function AttributesTab({
  productId,
  categorySlug,
  definitions,
  initialValues,
  onDirty,
  onClean,
}: {
  productId: string;
  categorySlug: string | null;
  definitions: AttributeDefinition[];
  initialValues: ProductAttributeRow[];
  onDirty: () => void;
  onClean: () => void;
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, AttributeValue>();
    for (const row of initialValues) {
      m.set(row.attribute_id, {
        value_text: row.value_text,
        value_number: row.value_number,
        value_boolean: row.value_boolean,
      });
    }
    return m;
  }, [initialValues]);

  const [values, setValues] = useState<Map<string, AttributeValue>>(initialMap);
  const [savedMap, setSavedMap] = useState<Map<string, AttributeValue>>(initialMap);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startSave] = useTransition();

  const dirty = useMemo(() => {
    // Dirty if any def's current value differs from the saved baseline.
    for (const def of definitions) {
      const cur = values.get(def.id) ?? EMPTY;
      const sav = savedMap.get(def.id) ?? EMPTY;
      if (!valuesEqual(cur, sav)) return true;
    }
    return false;
  }, [values, savedMap, definitions]);

  useEffect(() => {
    if (dirty) onDirty();
    else onClean();
  }, [dirty, onDirty, onClean]);

  const setOne = useCallback((id: string, next: AttributeValue) => {
    setValues((prev) => {
      const m = new Map(prev);
      m.set(id, next);
      return m;
    });
    // Clear the per-field error on edit.
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const onSave = useCallback(() => {
    setFieldErrors({});
    startSave(async () => {
      // Only send non-empty entries — empty means "remove this attribute".
      const payload: AttributeValueInput[] = [];
      for (const def of definitions) {
        const v = values.get(def.id) ?? EMPTY;
        if (isEmpty(v)) continue;
        payload.push({
          attribute_id: def.id,
          value_text: v.value_text,
          value_number: v.value_number,
          value_boolean: v.value_boolean,
        });
      }

      const r = await saveProductAttributes(productId, payload);
      if (r.ok) {
        toast.success("Attributes saved");
        setSavedMap(new Map(values));
        return;
      }
      if (r.error.code === "validation") {
        const errs: Record<string, string> = {};
        for (const i of r.error.issues) errs[i.attribute_id] = i.message;
        setFieldErrors(errs);
        toast.error("Some attributes need attention");
        return;
      }
      if (r.error.code === "select_value_invalid") {
        setFieldErrors({
          [r.error.attributeId]: `Allowed: ${r.error.allowed.join(", ")}`,
        });
        toast.error("Select value out of range");
        return;
      }
      if (r.error.code === "definition_not_found") {
        toast.error(
          "Some attribute definitions no longer exist. Refresh and retry.",
        );
      }
    });
  }, [productId, definitions, values]);

  // Empty state — no applicable definitions.
  if (definitions.length === 0) {
    return (
      <div className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500 sm:p-8">
        <p>
          {categorySlug
            ? "No attributes defined for this category yet."
            : "No global attributes defined yet. (Pick a category in the Category tab to see category-specific attributes.)"}
        </p>
        <p className="mt-2">
          <Link
            href="/admin/attributes"
            className="text-teal-800 underline-offset-2 hover:underline"
          >
            Manage attribute definitions →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <fieldset className="space-y-5 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Attributes
        </legend>

        <p className="text-xs text-stone-500">
          Definitions pulled from{" "}
          <Link
            href="/admin/attributes"
            className="text-teal-800 underline-offset-2 hover:underline"
          >
            attribute_definitions
          </Link>
          {categorySlug ? (
            <>
              {" "}for category <span className="font-mono">{categorySlug}</span> + globals.
            </>
          ) : (
            <> (globals only — pick a category to see more).</>
          )}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {definitions.map((def) => (
            <AttributeInput
              key={def.id}
              def={def}
              value={values.get(def.id) ?? EMPTY}
              onChange={(v) => setOne(def.id, v)}
              disabled={isPending}
              invalidMessage={fieldErrors[def.id] ?? null}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-husk-200 pt-3 text-sm">
          <span className="text-stone-500">
            {dirty ? "Unsaved changes" : "All attributes saved"}
          </span>
          <Button
            type="button"
            onClick={onSave}
            disabled={!dirty || isPending}
          >
            {isPending ? "Saving…" : "Save attributes"}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
