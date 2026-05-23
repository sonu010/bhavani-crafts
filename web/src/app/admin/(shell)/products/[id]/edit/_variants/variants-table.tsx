"use client";

import { Check, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OptionWithValues,
  VariantRow,
} from "@/lib/db/admin/variants";

const STOCK_STATUS_OPTIONS: Array<{
  value: VariantRow["stock_status"];
  label: string;
}> = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "made_to_order", label: "Made to order" },
  { value: "unknown", label: "Unknown" },
];

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

export type VariantDraft = VariantRow;

/**
 * Variants table with inline edits. Each row exposes SKU, name, price,
 * compare_at, stock_status, stock_quantity. The option-value combo is
 * displayed read-only as a string of value tags.
 *
 * Default-toggle and soft-delete are eager (their own server actions);
 * inline field edits batch into a single "Save variants" call.
 */
export function VariantsTable({
  options,
  variants,
  onChange,
  onSetDefault,
  onSoftDelete,
  disabled,
  pendingId,
}: {
  options: OptionWithValues[];
  variants: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  onSetDefault: (variantId: string) => void;
  onSoftDelete: (variantId: string) => void;
  disabled?: boolean;
  pendingId?: string | null;
}) {
  if (variants.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
        No variants yet. Define options above and click{" "}
        <span className="font-medium">Generate all variants</span> to create the
        full matrix.
      </div>
    );
  }

  const valueLabelById = new Map<string, { option: string; value: string }>();
  for (const opt of options) {
    for (const v of opt.values) {
      valueLabelById.set(v.id, { option: opt.name, value: v.value });
    }
  }

  const update = (idx: number, patch: Partial<VariantDraft>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-husk-200 bg-paper-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-stone-600">Combo</th>
            <th className="px-3 py-2 font-medium text-stone-600">SKU</th>
            <th className="px-3 py-2 font-medium text-stone-600">Price (₹)</th>
            <th className="px-3 py-2 font-medium text-stone-600">Compare-at</th>
            <th className="px-3 py-2 font-medium text-stone-600">Stock</th>
            <th className="px-3 py-2 font-medium text-stone-600">Qty</th>
            <th className="px-3 py-2 font-medium text-stone-600">Default</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v, idx) => {
            const combo = v.option_value_ids
              .map((id) => valueLabelById.get(id)?.value ?? id.slice(0, 6))
              .join(" · ");
            const isPending = pendingId === v.id;
            return (
              <tr
                key={v.id}
                className="border-b border-husk-200/60 last:border-b-0"
              >
                <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                  {combo || "—"}
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    value={v.sku}
                    onChange={(e) => update(idx, { sku: e.target.value.toUpperCase() })}
                    disabled={disabled || isPending}
                    className="h-8 font-mono text-xs"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    type="number"
                    value={v.price_inr ?? ""}
                    onChange={(e) =>
                      update(idx, {
                        price_inr: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={disabled || isPending}
                    className="h-8 w-24 text-xs"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    type="number"
                    value={v.compare_at_price_inr ?? ""}
                    onChange={(e) =>
                      update(idx, {
                        compare_at_price_inr:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={disabled || isPending}
                    className="h-8 w-24 text-xs"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    className={SELECT_CLASS}
                    value={v.stock_status}
                    onChange={(e) =>
                      update(idx, {
                        stock_status: e.target.value as VariantDraft["stock_status"],
                      })
                    }
                    disabled={disabled || isPending}
                  >
                    {STOCK_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    type="number"
                    value={v.stock_quantity ?? ""}
                    onChange={(e) =>
                      update(idx, {
                        stock_quantity:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={disabled || isPending}
                    className="h-8 w-20 text-xs"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Button
                    type="button"
                    size="icon"
                    variant={v.is_default ? "default" : "outline"}
                    onClick={() => onSetDefault(v.id)}
                    disabled={disabled || isPending || v.is_default}
                    aria-label={v.is_default ? "Default variant" : "Set as default"}
                  >
                    {v.is_default ? (
                      <Check className="size-4" />
                    ) : (
                      <Star className="size-4" />
                    )}
                  </Button>
                </td>
                <td className="px-3 py-2 align-top">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => onSoftDelete(v.id)}
                    disabled={disabled || isPending}
                    aria-label="Soft-delete variant"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards. Mirrors table fields but in a single column. */}
      <ul className="divide-y divide-husk-200/60 md:hidden">
        {variants.map((v, idx) => {
          const combo = v.option_value_ids
            .map((id) => valueLabelById.get(id)?.value ?? id.slice(0, 6))
            .join(" · ");
          const isPending = pendingId === v.id;
          return (
            <li key={v.id} className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-stone-500">
                    {combo || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant={v.is_default ? "default" : "outline"}
                    onClick={() => onSetDefault(v.id)}
                    disabled={disabled || isPending || v.is_default}
                    aria-label={v.is_default ? "Default variant" : "Set as default"}
                  >
                    {v.is_default ? (
                      <Check className="size-4" />
                    ) : (
                      <Star className="size-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => onSoftDelete(v.id)}
                    disabled={disabled || isPending}
                    aria-label="Soft-delete variant"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <Input
                value={v.sku}
                onChange={(e) => update(idx, { sku: e.target.value.toUpperCase() })}
                disabled={disabled || isPending}
                className="h-9 font-mono text-xs"
                placeholder="SKU"
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={v.price_inr ?? ""}
                  onChange={(e) =>
                    update(idx, {
                      price_inr: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={disabled || isPending}
                  className="h-9 text-xs"
                  placeholder="Price ₹"
                />
                <Input
                  type="number"
                  value={v.compare_at_price_inr ?? ""}
                  onChange={(e) =>
                    update(idx, {
                      compare_at_price_inr:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={disabled || isPending}
                  className="h-9 text-xs"
                  placeholder="Compare-at ₹"
                />
                <select
                  className={SELECT_CLASS}
                  value={v.stock_status}
                  onChange={(e) =>
                    update(idx, {
                      stock_status: e.target.value as VariantDraft["stock_status"],
                    })
                  }
                  disabled={disabled || isPending}
                >
                  {STOCK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  value={v.stock_quantity ?? ""}
                  onChange={(e) =>
                    update(idx, {
                      stock_quantity:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={disabled || isPending}
                  className="h-9 text-xs"
                  placeholder="Qty"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
