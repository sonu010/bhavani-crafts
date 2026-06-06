"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StorefrontImage as Image } from "@/components/storefront/storefront-image";
import type { ProductImage } from "@/lib/schemas/product";

/**
 * PDP gallery (P3-T14). Main image with thumbnail strip, keyboard arrows,
 * and touch swipe. Dependency-free — a small state machine over the
 * image array. RLS already filters to public-licensed images for anon,
 * so we trust whatever was handed in.
 *
 * Accessibility: thumbnails are real `<button>`s with aria-current.
 * Arrow keys navigate when the gallery has focus or the user has clicked
 * a thumb. The main image has priority (LCP candidate per Lighthouse).
 */
const SWIPE_THRESHOLD_PX = 50;

export function Gallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const [active, setActive] = useState(0);
  const main = images[active];
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => {
      if (images.length === 0) return;
      const wrapped = ((i % images.length) + images.length) % images.length;
      setActive(wrapped);
    },
    [images.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(active - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(active + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  if (images.length === 0) {
    return (
      <div className="aspect-[4/5] w-full overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
        <div className="flex h-full items-center justify-center text-stone-400">
          <span className="font-mono text-xs uppercase tracking-[0.2em]">
            No image
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3" aria-roledescription="carousel">
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-husk-200 bg-husk-100"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
            go(active + (dx < 0 ? 1 : -1));
          }
          touchStartX.current = null;
        }}
      >
        {main ? (
          <Image
            key={main.id}
            src={main.url}
            alt={main.alt ?? productName}
            fill
            sizes="(max-width: 1024px) 100vw, 640px"
            priority={active === 0}
            // The first PDP gallery image is the LCP. Same rationale as
            // the hero in _landing/hero.tsx — opt INTO the optimizer
            // even for cloudfront sources so the LCP gets resized.
            unoptimized={active === 0 ? false : undefined}
            placeholder={main.blur_data_url ? "blur" : "empty"}
            blurDataURL={main.blur_data_url ?? undefined}
            className="object-cover"
          />
        ) : null}
      </div>

      {images.length > 1 ? (
        // Plain <ul> of <button>s rather than role="tablist" / "tab".
        // The thumbs DON'T have associated `tabpanel`s — the main image
        // above isn't a tabpanel, it's a single composite image that
        // swaps. ARIA's tablist pattern requires `tab` > `tabpanel`
        // wiring (per axe-core rule `aria-required-children`), and we
        // don't have that. A plain button list with `aria-current="true"`
        // on the active one is the correct semantic and passes axe.
        <ul
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          aria-label={`${productName} images`}
        >
          {images.map((img, i) => {
            const selected = i === active;
            return (
              <li key={img.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Image ${i + 1} of ${images.length}`}
                  onClick={() => go(i)}
                  className={[
                    "relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border transition-colors sm:w-20",
                    selected
                      ? "border-bark-900"
                      : "border-husk-200 hover:border-husk-400",
                  ].join(" ")}
                >
                  <Image
                    src={img.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
