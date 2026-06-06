import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { listTopLevelCategories } from "@/lib/db/categories";
import { getCategoryCovers, type CategoryCover } from "@/lib/db/storefront";
import { readOrEmpty } from "@/lib/storefront/safe-read";

/**
 * Section #3 of the landing page (design-system.md §"Landing page
 * composition" #3): "The Atlas" — the top categories as a 2×4 grid
 * (desktop) / 2-col stack (mobile). Each tile is a real photo with the
 * Newsreader category name overlaid (mix-blend-multiply for legibility),
 * linking to /c/[slug].
 */

const MAX_TILES = 8;

const getAtlas = unstable_cache(
  async (): Promise<CategoryCover[]> => {
    const supabase = createPublicClient();
    const cats = (await listTopLevelCategories(supabase)).slice(0, MAX_TILES);
    return getCategoryCovers(supabase, cats);
  },
  ["landing-atlas"],
  { tags: ["categories", "products", "homepage"], revalidate: 300 },
);

export async function Atlas() {
  const tiles = await readOrEmpty<CategoryCover[]>("landing-atlas", getAtlas, []);
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
        The Atlas
      </h2>
      <p className="mt-2 text-sm text-stone-500">
        Every aisle of the studio, mapped.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              href={`/c/${tile.slug}`}
              className="group block focus-visible:outline-none"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
                {tile.imageUrl ? (
                  <Image
                    src={tile.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    placeholder={tile.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={tile.blurDataUrl ?? undefined}
                  />
                ) : (
                  <div className="absolute inset-0 bg-husk-100" />
                )}
                <span className="absolute inset-0 flex items-end p-4">
                  <span className="font-[family-name:var(--font-display)] text-2xl leading-tight text-paper-0 mix-blend-multiply">
                    {tile.name}
                  </span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
