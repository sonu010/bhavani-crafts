"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProductImageRow } from "@/lib/db/admin/images";

const MAX_CONCURRENT = 3;
const ACCEPT = "image/webp,image/jpeg,image/png,image/heic,image/heif";

type UploadStatus =
  | { phase: "queued" }
  | { phase: "uploading"; progress: number }
  | { phase: "ok"; image: ProductImageRow }
  | { phase: "error"; message: string };

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
}

/**
 * Drag-drop + file-picker dropzone with bounded concurrency.
 *
 * The server is the source of truth: we POST the raw bytes; the
 * /api/admin/images/upload route runs validation + EXIF strip + LQIP
 * before persisting. Client-side we show a thumbnail preview only;
 * the post-upload thumbnail comes from the server response.
 */
export function Dropzone({
  productId,
  onUploaded,
  disabled,
}: {
  productId: string;
  onUploaded: (image: ProductImageRow) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, { status: { phase: "uploading", progress: 0 } });

      const form = new FormData();
      form.append("productId", productId);
      form.append("file", item.file);

      try {
        const res = await fetch("/api/admin/images/upload", {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          updateItem(item.id, {
            status: { phase: "ok", image: json.image },
          });
          onUploaded(json.image);
          return;
        }
        const code = json.error?.code ?? `http_${res.status}`;
        const msg = formatError(code, json.error);
        updateItem(item.id, { status: { phase: "error", message: msg } });
        toast.error(`${item.file.name}: ${msg}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateItem(item.id, { status: { phase: "error", message: msg } });
        toast.error(`${item.file.name}: ${msg}`);
      }
    },
    [productId, onUploaded, updateItem],
  );

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const next: UploadItem[] = arr.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: { phase: "queued" },
      }));
      setItems((prev) => [...prev, ...next]);
      // Schedule with bounded concurrency. Simpler than a worker pool —
      // just slice and chain.
      (async () => {
        for (let i = 0; i < next.length; i += MAX_CONCURRENT) {
          const batch = next.slice(i, i + MAX_CONCURRENT);
          await Promise.all(batch.map(uploadOne));
        }
      })();
    },
    [uploadOne],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files);
    },
    [enqueue, disabled],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "rounded-lg border-2 border-dashed p-6 text-center transition",
          dragOver
            ? "border-teal-800 bg-teal-50/40"
            : "border-husk-200 bg-paper-50",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <ImagePlus className="mx-auto mb-2 size-6 text-stone-500" />
        <p className="text-sm text-bark-900">
          Drop images here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="text-teal-800 underline underline-offset-2 hover:text-teal-900"
          >
            choose files
          </button>
        </p>
        <p className="mt-1 text-xs text-stone-500">
          JPEG · PNG · WebP · HEIC · up to 5 MB each, max 4000 × 4000 px
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-husk-200 bg-paper-0 px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-stone-500">
                {item.file.name} · {formatBytes(item.file.size)}
              </span>
              <span className="font-medium">{renderStatus(item.status)}</span>
            </li>
          ))}
          {items.some((i) => i.status.phase !== "uploading" && i.status.phase !== "queued") ? (
            <li className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems([])}
              >
                Clear finished
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderStatus(s: UploadStatus): string {
  if (s.phase === "queued") return "Queued";
  if (s.phase === "uploading") return "Uploading…";
  if (s.phase === "ok") return "Uploaded";
  return s.message;
}

function formatError(code: string, error: unknown): string {
  const e = (error as { code?: string }) ?? {};
  switch (code) {
    case "too_large":
      return "Too large — 5 MB max";
    case "bad_mime":
      return `Not an image (sniffed: ${(error as { sniffed?: string })?.sniffed ?? "unknown"})`;
    case "too_wide":
      return "Dimensions exceed 4000 × 4000 px";
    case "decode_failed":
      return "Couldn't decode image";
    case "rate_limited":
      return `Slow down — retry in ${(error as { retryAfter?: number })?.retryAfter ?? 60}s`;
    case "unauthenticated":
      return "Session expired — refresh and try again";
    case "forbidden":
    case "mfa_not_verified":
      return "Permission denied";
    case "product_not_found":
      return "Product not found";
    case "upload_failed":
    case "process_failed":
    case "db_insert_failed":
    case "audit_failed":
      return `Server error (${code})`;
    default:
      return e.code ?? code ?? "Upload failed";
  }
}
