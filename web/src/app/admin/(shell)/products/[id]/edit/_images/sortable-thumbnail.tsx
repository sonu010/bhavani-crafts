"use client";

import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, GripVertical, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LicenseStatus, ProductImageRow } from "@/lib/db/admin/images";

const VERIFIED: LicenseStatus[] = ["owned", "licensed", "public_domain"];

/**
 * Draggable thumbnail card. Wraps next/image, the drag handle, the
 * license/alt indicator badges, and three actions (edit alt, edit
 * license, soft-delete).
 *
 * @dnd-kit handles keyboard reorder (Tab → Space → Arrow → Space) so
 * we don't need a separate "move up / move down" affordance.
 */
export function SortableThumbnail({
  image,
  onEditAlt,
  onEditLicense,
  onDelete,
  disabled,
}: {
  image: ProductImageRow;
  onEditAlt: () => void;
  onEditLicense: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id, disabled });

  const verified = VERIFIED.includes(image.license_status);
  const missingAlt = !image.alt || image.alt.trim() === "";

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={[
        "group relative overflow-hidden rounded-md border border-husk-200 bg-paper-50",
        isDragging ? "shadow-lg ring-2 ring-teal-800/40" : "",
      ].join(" ")}
    >
      <div className="relative aspect-square">
        <Image
          src={image.url}
          alt={image.alt ?? ""}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover"
          placeholder={image.blur_data_url ? "blur" : "empty"}
          blurDataURL={image.blur_data_url ?? undefined}
        />

        {/* Drag handle — top-left, only visible on hover/focus for desktop;
            always visible on touch (no hover, can't hide). */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          disabled={disabled}
          className="absolute left-1.5 top-1.5 rounded-md bg-paper-0/90 p-1 text-stone-600 shadow-sm transition focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-teal-800/30 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <GripVertical className="size-4" />
        </button>

        {/* Status pills — top-right. unverified license OR missing alt */}
        <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
          {!verified ? (
            <span
              title={`License: ${image.license_status}`}
              className="inline-flex items-center gap-1 rounded-full bg-saffron-500/90 px-2 py-0.5 text-[10px] font-medium text-clay-900"
            >
              <AlertCircle className="size-3" />
              {image.license_status}
            </span>
          ) : null}
          {missingAlt ? (
            <span
              title="Alt text missing — accessibility hint"
              className="inline-flex items-center gap-1 rounded-full bg-stone-700/80 px-2 py-0.5 text-[10px] font-medium text-paper-0"
            >
              no alt
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-husk-200/60 p-1.5">
        <span className="truncate font-mono text-[11px] text-stone-500">
          {image.width}×{image.height}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onEditAlt}
            aria-label="Edit alt text"
            disabled={disabled}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onEditLicense}
            aria-label="Edit license status"
            disabled={disabled}
          >
            <ShieldCheck className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onDelete}
            aria-label="Remove image"
            disabled={disabled}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}
