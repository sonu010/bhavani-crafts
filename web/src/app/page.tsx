/**
 * Temporary placeholder home page.
 *
 * The real editorial split-hero homepage lands in Phase 3 (P3-T02 through P3-T09).
 * Until then this page exists to:
 *   - confirm the design tokens render correctly
 *   - give the owner something to look at while the catalog is wired up
 *   - link the dev to the /design palette gallery
 *
 * Do NOT polish this. P3-T02 replaces it wholesale.
 */
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-stone-500">
          rebuild · phase 0
        </p>
        <h1 className="mt-8 font-[family-name:var(--font-display)] text-5xl leading-[1.05] tracking-tight text-bark-900 sm:text-6xl">
          Bhavani <em className="italic text-clay-600">Crafts</em>
        </h1>
        <p className="mt-6 text-base leading-relaxed text-stone-500">
          A craft-supply studio in Hyderabad. The storefront is under
          construction — the legacy preview still lives on the production URL.
        </p>
        <div className="mt-12 flex items-center justify-center gap-3 text-xs">
          <span className="rounded-full border border-husk-200 px-3 py-1 font-mono uppercase tracking-[0.2em] text-stone-500">
            Phase 0
          </span>
          <span className="rounded-full bg-teal-50 px-3 py-1 font-mono uppercase tracking-[0.2em] text-teal-800">
            Design tokens · locked
          </span>
        </div>
      </div>
    </main>
  );
}
