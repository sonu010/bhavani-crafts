"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Multipart upload form. POSTs to /api/admin/imports/upload, then
 * routes to the preview page on success. Failures surface as toasts
 * keyed on the route's error codes.
 */
export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startUpload] = useTransition();

  const onUpload = () => {
    if (!file) {
      toast.error("Pick a CSV first");
      return;
    }
    startUpload(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/imports/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(
          `Validated ${json.total} rows · ${json.success ?? 0} ok · ${json.errors ?? 0} errors`,
        );
        router.push(`/admin/imports/${json.importRunId}`);
        return;
      }
      const code = json?.error?.code ?? `http_${res.status}`;
      switch (code) {
        case "too_large":
          toast.error("File too large — 20 MB max");
          break;
        case "bad_mime":
          toast.error("Expected a .csv file");
          break;
        case "missing_columns":
          toast.error(
            `Missing required columns: ${(json.error.missing ?? []).join(", ")}`,
          );
          break;
        case "unauthenticated":
          toast.error("Session expired — refresh and retry");
          break;
        default:
          toast.error(`Upload failed (${code})`);
      }
    });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
      <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
        Upload
      </legend>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-bark-900 file:mr-3 file:rounded-md file:border file:border-husk-200 file:bg-paper-50 file:px-3 file:py-1.5 file:font-medium file:text-bark-900 hover:file:bg-paper-100"
      />
      {file ? (
        <p className="font-mono text-xs text-stone-500">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={onUpload} disabled={!file || isPending}>
          <Upload className="size-4" />
          {isPending ? "Validating…" : "Upload + validate"}
        </Button>
      </div>
    </fieldset>
  );
}
