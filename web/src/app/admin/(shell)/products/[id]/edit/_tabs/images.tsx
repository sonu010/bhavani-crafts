"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProductImageRow } from "@/lib/db/admin/images";
import { softDeleteProductImageAction } from "../actions";
import { Dropzone } from "../_images/dropzone";

/**
 * Images tab. Two parts:
 *   - Dropzone (drag-drop + file picker) that POSTs each file to the
 *     /api/admin/images/upload route. The route handles everything
 *     security-wise (MIME sniff, EXIF strip, transcode, LQIP, audit
 *     log).
 *   - Thumbnail grid with per-image soft-delete. Reorder lands in
 *     P2-T16.
 *
 * Local state advances as uploads finish — no full-page reload.
 */
export function ImagesTab({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: ProductImageRow[];
}) {
  const [images, setImages] = useState<ProductImageRow[]>(initialImages);

  const onUploaded = useCallback((image: ProductImageRow) => {
    setImages((prev) => [...prev, image]);
  }, []);

  const onDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Move this image to Trash?")) return;
      (async () => {
        const r = await softDeleteProductImageAction(productId, id);
        if (r.ok) {
          toast.success("Image moved to Trash");
          setImages((rows) => rows.filter((img) => img.id !== id));
        } else {
          toast.error("Could not delete image");
        }
      })();
    },
    [productId],
  );

  const hasUnverified = images.some((i) => i.license_status === "unverified");

  return (
    <div className="space-y-6 pb-24">
      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Upload
        </legend>
        <Dropzone productId={productId} onUploaded={onUploaded} />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Gallery
        </legend>

        {hasUnverified ? (
          <p className="rounded-md border border-saffron-400/40 bg-saffron-50 px-3 py-2 text-xs text-clay-700">
            One or more images are <span className="font-medium">unverified</span>.
            Verify licensing before publishing (Publish tab will block until
            all images are owned/licensed/public-domain).
          </p>
        ) : null}

        {images.length === 0 ? (
          <p className="text-sm text-stone-500">
            No images yet. Drop one above to start.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img) => (
              <li
                key={img.id}
                className="group relative overflow-hidden rounded-md border border-husk-200 bg-paper-50"
              >
                <div className="relative aspect-square">
                  <Image
                    src={img.url}
                    alt={img.alt ?? ""}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                    placeholder={img.blur_data_url ? "blur" : "empty"}
                    blurDataURL={img.blur_data_url ?? undefined}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-husk-200/60 p-1.5 text-xs">
                  <span className="truncate font-mono text-stone-500">
                    {img.width}×{img.height}
                    {img.license_status === "unverified" ? (
                      <span className="ml-1 text-clay-700">· unverified</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => onDelete(img.id)}
                    aria-label="Remove image"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
