"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OptionInput,
  OptionValueInput,
} from "@/lib/db/admin/variants";

/**
 * Options + values editor. Controlled by the parent VariantsTab.
 *
 * Each option has a name + a list of values. Owner can add/remove
 * options and values. Removal of a value or option that's referenced
 * by an active variant is blocked server-side; we surface that as a
 * toast in the parent.
 */
export function OptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: OptionInput[];
  onChange: (next: OptionInput[]) => void;
  disabled?: boolean;
}) {
  const [valueDraft, setValueDraft] = useState<Record<number, string>>({});

  const update = useCallback(
    (idx: number, patch: Partial<OptionInput>) => {
      const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
      onChange(next);
    },
    [options, onChange],
  );

  const addOption = useCallback(() => {
    onChange([
      ...options,
      {
        id: null,
        name: "",
        sort_order: options.length,
        values: [],
      },
    ]);
  }, [options, onChange]);

  const removeOption = useCallback(
    (idx: number) => {
      onChange(options.filter((_, i) => i !== idx));
    },
    [options, onChange],
  );

  const addValue = useCallback(
    (idx: number, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const opt = options[idx];
      if (opt.values.some((v) => v.value.toLowerCase() === trimmed.toLowerCase())) {
        return;
      }
      const nextValue: OptionValueInput = {
        id: null,
        value: trimmed,
        sort_order: opt.values.length,
      };
      update(idx, { values: [...opt.values, nextValue] });
      setValueDraft((d) => ({ ...d, [idx]: "" }));
    },
    [options, update],
  );

  const removeValue = useCallback(
    (optIdx: number, valIdx: number) => {
      const opt = options[optIdx];
      update(optIdx, { values: opt.values.filter((_, i) => i !== valIdx) });
    },
    [options, update],
  );

  return (
    <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
      <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
        Options
      </legend>

      {options.length === 0 ? (
        <p className="text-sm text-stone-500">
          No options yet. Add one (e.g., &ldquo;Size&rdquo;) to start defining
          variants.
        </p>
      ) : (
        <div className="space-y-4">
          {options.map((opt, idx) => (
            <div
              key={opt.id ?? `new-${idx}`}
              className="space-y-3 rounded-md border border-husk-200/70 bg-paper-50 p-3 sm:p-4"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={opt.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder="Option name (e.g. Size)"
                  disabled={disabled}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeOption(idx)}
                  disabled={disabled}
                  aria-label={`Remove option ${opt.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {opt.values.map((val, valIdx) => (
                  <span
                    key={val.id ?? `new-${valIdx}`}
                    className="inline-flex items-center gap-1 rounded-full border border-husk-200 bg-paper-0 px-2.5 py-1 text-xs"
                  >
                    <span className="text-bark-900">{val.value}</span>
                    <button
                      type="button"
                      onClick={() => removeValue(idx, valIdx)}
                      disabled={disabled}
                      className="text-stone-500 hover:text-brick-600 disabled:opacity-40"
                      aria-label={`Remove value ${val.value}`}
                    >
                      ×
                    </button>
                  </span>
                ))}

                <div className="flex items-center gap-1">
                  <Input
                    value={valueDraft[idx] ?? ""}
                    onChange={(e) =>
                      setValueDraft((d) => ({ ...d, [idx]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addValue(idx, valueDraft[idx] ?? "");
                      }
                    }}
                    placeholder="Add value"
                    disabled={disabled}
                    className="h-8 w-32 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addValue(idx, valueDraft[idx] ?? "")}
                    disabled={disabled || !(valueDraft[idx] ?? "").trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={addOption}
        disabled={disabled}
      >
        <Plus className="size-4" />
        Add option
      </Button>
    </fieldset>
  );
}
