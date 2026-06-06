import { Hero } from "./_landing/hero";
import { CaptionStrip } from "./_landing/caption-strip";
import { Atlas } from "./_landing/atlas";
import { WeeklyCollection } from "./_landing/weekly-collection";
import { KitsRow } from "./_landing/kits-row";
import { BulkEnquiry } from "./_landing/bulk-enquiry";
import { Visit } from "./_landing/visit";

/**
 * The editorial landing page (P3-T02 – T08). Composition only — every
 * section is a self-contained server component that does its own cached
 * read, so this page stays statically prerendered + ISR (the perf
 * contract in architecture/performance.md). Sections render in the order
 * locked by design-system.md §"Landing page composition".
 *
 * Sections that have no data yet hide themselves (Atlas with no
 * categories, weekly collection with no featured products, kits row with
 * no workshop-kits category), so the page degrades gracefully during
 * early catalog setup.
 */
export default function Home() {
  return (
    <main className="flex flex-col">
      <Hero />
      <CaptionStrip />
      <Atlas />
      <WeeklyCollection />
      <KitsRow />
      <BulkEnquiry />
      <Visit />
    </main>
  );
}
