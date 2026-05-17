"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyEnrollAction } from "./actions";

export function EnrollForm({
  factorId,
  qrCodeSvg,
  secret,
}: {
  factorId: string;
  qrCodeSvg: string;
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
          qr_code is an SVG document from Supabase. The standard recipe is
          to URL-encode it and use it as a data: URI src. We render it as
          an <img> so right-click → save-image works on dev environments.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="TOTP setup QR code"
          src={`data:image/svg+xml;utf-8,${encodeURIComponent(qrCodeSvg)}`}
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
