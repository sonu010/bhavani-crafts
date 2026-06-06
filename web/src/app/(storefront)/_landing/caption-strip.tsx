/**
 * Section #2 of the landing page (design-system.md §"Landing page
 * composition" #2): a thin tabbed metadata strip with husk-200
 * hairlines top + bottom — the "ticker" feel.
 *
 * Static copy. The owner edits these three facts in one place. On
 * mobile the row scrolls horizontally rather than wrapping, to keep the
 * single-line ticker rhythm.
 */
const FACTS = [
  "Made in Hyderabad",
  "Stocked in 200 schools",
  "Open Tues–Sun",
] as const;

export function CaptionStrip() {
  return (
    <div className="border-y border-husk-200">
      <div className="mx-auto max-w-6xl px-6">
        <ul className="flex items-center gap-6 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FACTS.map((fact, i) => (
            <li
              key={fact}
              className="flex shrink-0 items-center gap-6 font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500"
            >
              <span>{fact}</span>
              {i < FACTS.length - 1 ? (
                <span aria-hidden className="text-husk-200">
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
