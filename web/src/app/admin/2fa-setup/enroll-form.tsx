"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyEnrollAction } from "./actions";

export function EnrollForm({
  factorId,
  qrCodeDataUri,
  secret,
}: {
  factorId: string;
  /**
   * Already a complete `data:image/svg+xml;utf-8,<svg>…</svg>` URI from
   * supabase.auth.mfa.enroll(). The Supabase TS comment is misleading —
   * it tells you to prepend `data:image/svg+xml;utf-8,` to the value,
   * but the runtime value is already prefixed. Use as-is.
   */
  qrCodeDataUri: string;
  secret: string;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await verifyEnrollAction(formData);
      if (result && "error" in result) {
        setError(result.error);
      }
      // On success the action calls redirect() — this branch never returns.
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        {/*
          qrCodeDataUri is already a complete data:image/svg+xml;utf-8,…
          URI from Supabase. NEVER re-encode or re-prefix — that double-
          wraps it and the browser can't parse the result.

          Using <img> (not next/image) because data: URIs aren't supported
          by next/image and we don't want to pipe a 300KB SVG through it
          anyway.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="TOTP setup QR code"
          src={qrCodeDataUri}
          className="size-48 rounded-lg border border-husk-200 bg-paper-0 p-2"
        />
      </div>

      <details className="rounded-lg border border-husk-200 bg-paper-0 p-3 text-sm">
        <summary
          className="cursor-pointer text-stone-500"
          onClick={() => setShowSecret((v) => !v)}
        >
          Can&rsquo;t scan? Enter the secret manually
        </summary>
        {showSecret ? (
          <p className="mt-2 break-all font-mono text-xs text-bark-900">
            {secret}
          </p>
        ) : null}
      </details>

      <form action={handleSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="factorId" value={factorId} />
        <div className="space-y-2">
          <Label htmlFor="code">6-digit code from your authenticator</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            disabled={isPending}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-brick-600">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Verifying…" : "Verify + enable 2FA"}
        </Button>
      </form>
    </div>
  );
}
