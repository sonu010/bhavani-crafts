import Image from "next/image";
import type { Category } from "@/lib/schemas/category";

/**
 * Category page header (P3-T10): name, optional description, optional
 * cover image. Server-renderable.
 */
export function CategoryHeader({ category }: { category: Category }) {
  return (
    <header className="space-y-4">
      {category.image_url ? (
        <div className="relative aspect-[3/1] overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
          <Image
            src={category.image_url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            {category.description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
