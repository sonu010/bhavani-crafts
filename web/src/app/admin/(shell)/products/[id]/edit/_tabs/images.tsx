"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import type {
  LicenseStatus,
  ProductImageRow,
} from "@/lib/db/admin/images";
import {
  reorderImagesAction,
  softDeleteProductImageAction,
} from "../actions";
import { AltTextEditDialog } from "../_images/alt-text-edit";
import { Dropzone } from "../_images/dropzone";
import { LicenseEditDialog } from "../_images/license-edit";
import { SortableThumbnail } from "../_images/sortable-thumbnail";

/**
 * Images tab. Composes:
 *
 *   - Dropzone (upload) — see _images/dropzone.tsx.
 *   - Sortable gallery — drag-reorder via @dnd-kit/sortable. Server is
 *     the source of truth; on drag-end we optimistically advance local
 *     state, then call reorderImagesAction. On failure we revert.
 *   - Alt-text dialog + license dialog — modal popovers.
 *
 * Reorder persists in a single round-trip server action which loops N
 * UPDATEs (≤ 20 images per product in practice — RPC would be
 * over-engineering at this volume).
 */
export function ImagesTab({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: ProductImageRow[];
}) {
  const [images, setImages] = useState<ProductImageRow[]>(initialImages);
  const [altTarget, setAltTarget] = useState<ProductImageRow | null>(null);
  const [licenseTarget, setLicenseTarget] = useState<ProductImageRow | null>(null);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid catching a click on the edit/delete buttons as the start
      // of a drag — require a small movement first.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = images.findIndex((i) => i.id === active.id);
      const newIdx = images.findIndex((i) => i.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;

      const prev = images;
      const next = arrayMove(images, oldIdx, newIdx);
      setImages(next); // optimistic
      setReordering(true);

      (async () => {
        const r = await reorderImagesAction(
          productId,
          next.map((i) => i.id),
        );
        setReordering(false);
        if (!r.ok) {
          setImages(prev);
          toast.error("Could not save new order — reverted");
        }
      })();
    },
    [images, productId],
  );

  const onAltSaved = useCallback((imageId: string, alt: string) => {
    setImages((rows) =>
      rows.map((img) => (img.id === imageId ? { ...img, alt: alt || null } : img)),
    );
  }, []);

  const onLicenseSaved = useCallback(
    (imageId: string, status: LicenseStatus) => {
      setImages((rows) =>
        rows.map((img) =>
          img.id === imageId ? { ...img, license_status: status } : img,
        ),
      );
    },
    [],
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
          {reordering ? (
            <span className="ml-2 font-mono text-[10px] text-stone-500">saving order…</span>
          ) : null}
        </legend>

        {hasUnverified ? (
          <p className="rounded-md border border-saffron-400/40 bg-saffron-50 px-3 py-2 text-xs text-clay-700">
            One or more images are <span className="font-medium">unverified</span>.
            Verify licensing before publishing (Publish tab will block until
            all images are owned / licensed / public-domain).
          </p>
        ) : null}

        {images.length === 0 ? (
          <p className="text-sm text-stone-500">
            No images yet. Drop one above to start.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={images.map((i) => i.id)}
              strategy={rectSortingStrategy}
            >
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((img) => (
                  <SortableThumbnail
                    key={img.id}
                    image={img}
                    onEditAlt={() => setAltTarget(img)}
                    onEditLicense={() => setLicenseTarget(img)}
                    onDelete={() => onDelete(img.id)}
                    disabled={reordering}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <p className="text-[11px] text-stone-500">
          Tip — drag the grip icon on a thumbnail to reorder. Keyboard:
          focus a thumbnail, press Space to grab, arrow keys to move, Space
          again to drop.
        </p>
      </fieldset>

      {/* `key={target.id}` forces a fresh mount on each new image, so
         the dialog's useState initial values match props without a
         useEffect-sync (which lint rejects under React Compiler). */}
      <AltTextEditDialog
        key={altTarget?.id ?? "alt-empty"}
        productId={productId}
        imageId={altTarget?.id ?? null}
        currentAlt={altTarget?.alt ?? null}
        open={altTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAltTarget(null);
        }}
        onSaved={onAltSaved}
      />

      <LicenseEditDialog
        key={licenseTarget?.id ?? "lic-empty"}
        productId={productId}
        imageId={licenseTarget?.id ?? null}
        currentStatus={licenseTarget?.license_status ?? null}
        open={licenseTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLicenseTarget(null);
        }}
        onSaved={onLicenseSaved}
      />
    </div>
  );
}
