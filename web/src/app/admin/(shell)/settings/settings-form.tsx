"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AppSettingsMap } from "@/lib/db/app-settings";
import { saveAppSettings } from "./actions";

/**
 * Settings editor form. Single-page, all fields visible at once —
 * we have four settings; no need for tabs or a sidebar.
 *
 * On save:
 *   - The full patch goes to the server action.
 *   - On a field-level validation error from the server, the message
 *     surfaces both as a toast and inline next to the affected field.
 *   - On success the form re-syncs `initial` to the current values so
 *     a second submit without further edits is a no-op.
 */

const LABEL = "block text-xs font-medium uppercase tracking-wide text-stone-600";
const INPUT =
  "h-10 w-full rounded-md border border-husk-200 bg-paper-0 px-3 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

export function SettingsForm({ initial }: { initial: AppSettingsMap }) {
  const [form, setForm] = useState<AppSettingsMap>(initial);
  const [fieldError, setFieldError] =
    useState<{ field: keyof AppSettingsMap; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function field<K extends keyof AppSettingsMap>(
    key: K,
    value: AppSettingsMap[K],
  ) {
    setFieldError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await saveAppSettings(form);
        if (!res.ok) {
          if (res.field) {
            setFieldError({ field: res.field, message: res.error });
          }
          toast.error(res.error);
          return;
        }
        toast.success("Settings saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-6 rounded-lg border border-husk-200 bg-paper-0 p-6"
    >
      <FieldRow
        id="shop_name"
        label="Shop name"
        hint="Appears on the storefront brand wordmark + page titles."
        error={fieldError?.field === "shop_name" ? fieldError.message : null}
      >
        <input
          id="shop_name"
          required
          maxLength={80}
          value={form.shop_name}
          onChange={(e) => field("shop_name", e.target.value)}
          className={INPUT}
        />
      </FieldRow>

      <FieldRow
        id="whatsapp_number"
        label="WhatsApp number"
        hint="Country code + digits, no spaces or hyphens. e.g. +919876543210. Powers the bulk-enquiry CTA + checkout pending follow-up."
        error={
          fieldError?.field === "whatsapp_number" ? fieldError.message : null
        }
      >
        <input
          id="whatsapp_number"
          inputMode="tel"
          autoComplete="off"
          placeholder="+919876543210"
          value={form.whatsapp_number}
          onChange={(e) => field("whatsapp_number", e.target.value)}
          className={INPUT}
        />
      </FieldRow>

      <FieldRow
        id="instagram_url"
        label="Instagram URL"
        hint="Full profile URL. Leave empty to hide the footer link."
        error={
          fieldError?.field === "instagram_url" ? fieldError.message : null
        }
      >
        <input
          id="instagram_url"
          type="url"
          autoComplete="off"
          placeholder="https://instagram.com/bhavanicrafts"
          value={form.instagram_url}
          onChange={(e) => field("instagram_url", e.target.value)}
          className={INPUT}
        />
      </FieldRow>

      <FieldRow
        id="shipping_flat_inr"
        label="Shipping flat rate (₹)"
        hint="Added to every order. Set to 0 for free shipping."
        error={
          fieldError?.field === "shipping_flat_inr"
            ? fieldError.message
            : null
        }
      >
        <input
          id="shipping_flat_inr"
          type="number"
          min={0}
          inputMode="numeric"
          required
          value={form.shipping_flat_inr}
          onChange={(e) => field("shipping_flat_inr", e.target.value)}
          className={INPUT}
        />
      </FieldRow>

      <div className="flex justify-end border-t border-husk-200 pt-4">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="size-3.5" /> Save settings
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function FieldRow({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-brick-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}
