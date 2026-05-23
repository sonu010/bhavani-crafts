"use client";

import { Input } from "@/components/ui/input";
import type { AttributeDefinition } from "@/lib/db/attributes";

/**
 * Renders the right control for a single attribute_definition, driven
 * by its `type` column. Controlled — parent owns the values map and
 * passes the relevant slice in via props.
 */

export type AttributeValue = {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

export function AttributeInput({
  def,
  value,
  onChange,
  disabled,
  invalidMessage,
}: {
  def: AttributeDefinition;
  value: AttributeValue;
  onChange: (next: AttributeValue) => void;
  disabled?: boolean;
  invalidMessage?: string | null;
}) {
  const id = `attr-${def.slug}`;
  const describedBy = invalidMessage ? `${id}-err` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-2 text-sm"
      >
        <span className="font-medium text-bark-900">{def.name}</span>
        <span className="font-mono text-xs text-stone-500">{def.slug}</span>
      </label>

      {def.type === "text" ? (
        <Input
          id={id}
          type="text"
          value={value.value_text ?? ""}
          onChange={(e) =>
            onChange({
              value_text: e.target.value || null,
              value_number: null,
              value_boolean: null,
            })
          }
          disabled={disabled}
          aria-invalid={!!invalidMessage}
          aria-describedby={describedBy}
        />
      ) : null}

      {def.type === "number" ? (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={value.value_number ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                onChange({ value_text: null, value_number: null, value_boolean: null });
                return;
              }
              const n = Number(raw);
              onChange({
                value_text: null,
                value_number: Number.isFinite(n) ? n : null,
                value_boolean: null,
              });
            }}
            disabled={disabled}
            aria-invalid={!!invalidMessage}
            aria-describedby={describedBy}
            className="flex-1"
          />
          {def.unit ? (
            <span className="font-mono text-xs text-stone-500">{def.unit}</span>
          ) : null}
        </div>
      ) : null}

      {def.type === "boolean" ? (
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-bark-900"
        >
          <input
            id={id}
            type="checkbox"
            className="size-4 accent-teal-800"
            checked={value.value_boolean === true}
            onChange={(e) =>
              onChange({
                value_text: null,
                value_number: null,
                value_boolean: e.target.checked ? true : null,
              })
            }
            disabled={disabled}
          />
          Yes
        </label>
      ) : null}

      {def.type === "select" ? (
        <select
          id={id}
          className={SELECT_CLASS}
          value={value.value_text ?? ""}
          onChange={(e) =>
            onChange({
              value_text: e.target.value || null,
              value_number: null,
              value_boolean: null,
            })
          }
          disabled={disabled}
          aria-invalid={!!invalidMessage}
          aria-describedby={describedBy}
        >
          <option value="">— Not set —</option>
          {(def.options_json ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : null}

      {invalidMessage ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-brick-600">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}
