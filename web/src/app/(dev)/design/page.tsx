/**
 * /design — internal token gallery.
 * Dev-only (gated by (dev)/layout.tsx). Renders every palette token, every
 * typography scale entry, every button + input + badge variant.
 *
 * Open at http://localhost:3000/design while running `pnpm dev`.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Swatch = { name: string; varName: string; hex: string };

const palette: { group: string; swatches: Swatch[] }[] = [
  {
    group: "Surfaces",
    swatches: [
      { name: "cream-50", varName: "--color-cream-50", hex: "#FAF5EE" },
      { name: "cream-100", varName: "--color-cream-100", hex: "#F6EFE2" },
      { name: "paper-0", varName: "--color-paper-0", hex: "#FFFCF6" },
      { name: "husk-100", varName: "--color-husk-100", hex: "#F0E8D6" },
      { name: "husk-200", varName: "--color-husk-200", hex: "#E6DCC9" },
      { name: "husk-300", varName: "--color-husk-300", hex: "#D4C5A3" },
    ],
  },
  {
    group: "Ink",
    swatches: [
      { name: "stone-400", varName: "--color-stone-400", hex: "#897F70" },
      { name: "stone-500", varName: "--color-stone-500", hex: "#6E665B" },
      { name: "bark-700", varName: "--color-bark-700", hex: "#3A322B" },
      { name: "bark-800", varName: "--color-bark-800", hex: "#2A2421" },
      { name: "bark-900", varName: "--color-bark-900", hex: "#1C1815" },
    ],
  },
  {
    group: "Teal (primary CTAs)",
    swatches: [
      { name: "teal-50", varName: "--color-teal-50", hex: "#E6EEEC" },
      { name: "teal-100", varName: "--color-teal-100", hex: "#C2D6D2" },
      { name: "teal-500", varName: "--color-teal-500", hex: "#2E6862" },
      { name: "teal-700", varName: "--color-teal-700", hex: "#285A55" },
      { name: "teal-800", varName: "--color-teal-800", hex: "#1F4E4A" },
      { name: "teal-900", varName: "--color-teal-900", hex: "#163834" },
    ],
  },
  {
    group: "Clay (brand accents — not buttons)",
    swatches: [
      { name: "clay-50", varName: "--color-clay-50", hex: "#F9EAE0" },
      { name: "clay-100", varName: "--color-clay-100", hex: "#F3D7BF" },
      { name: "clay-500", varName: "--color-clay-500", hex: "#C9612E" },
      { name: "clay-600", varName: "--color-clay-600", hex: "#B8552E" },
      { name: "clay-700", varName: "--color-clay-700", hex: "#9A4423" },
    ],
  },
  {
    group: "Saffron (highlight only — sparing)",
    swatches: [
      { name: "saffron-100", varName: "--color-saffron-100", hex: "#FAE7C2" },
      { name: "saffron-300", varName: "--color-saffron-300", hex: "#E8C273" },
      { name: "saffron-500", varName: "--color-saffron-500", hex: "#D8A24A" },
    ],
  },
  {
    group: "Semantic",
    swatches: [
      { name: "moss-100", varName: "--color-moss-100", hex: "#DEE7DD" },
      { name: "moss-600", varName: "--color-moss-600", hex: "#5A7A5C" },
      { name: "brick-100", varName: "--color-brick-100", hex: "#F2D3D1" },
      { name: "brick-600", varName: "--color-brick-600", hex: "#B8312E" },
    ],
  },
];

export default function DesignPage() {
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-husk-200 bg-paper-0 px-8 py-10">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-stone-500">
          internal · dev only
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl tracking-tight text-bark-900">
          Bhavani <em className="italic text-clay-600">design system</em>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-500">
          Locked tokens, type scale, and component variants. Source of truth:{" "}
          <code className="font-mono text-bark-900">
            claude/architecture/design-system.md
          </code>
          .
        </p>
      </header>

      <div className="mx-auto max-w-6xl space-y-16 px-8 py-12">
        {/* Palette */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Palette
          </h2>
          <div className="space-y-8">
            {palette.map((group) => (
              <div key={group.group}>
                <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  {group.group}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {group.swatches.map((s) => (
                    <div
                      key={s.name}
                      className="overflow-hidden rounded-md border border-husk-200 bg-paper-0"
                    >
                      <div
                        className="h-20 w-full"
                        style={{ backgroundColor: s.hex }}
                      />
                      <div className="p-3">
                        <p className="font-mono text-xs text-bark-900">{s.name}</p>
                        <p className="font-mono text-[10px] text-stone-500">
                          {s.hex}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Typography
          </h2>
          <Card>
            <CardContent className="space-y-8 p-8">
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  Display · Newsreader
                </p>
                <p className="font-[family-name:var(--font-display)] text-6xl leading-[1.05] tracking-tight text-bark-900">
                  Bhavani <em className="italic text-clay-600">Crafts</em>
                </p>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  H1 · Newsreader 500
                </p>
                <h1 className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-bark-900">
                  This week: monsoon resin colours
                </h1>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  H2 · Newsreader 500
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-bark-900">
                  Curated for slow afternoons
                </h2>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  H3 · Manrope 600
                </p>
                <h3 className="text-xl font-semibold text-bark-900">
                  Acrylic Paint Set · 12 colours
                </h3>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  Body · Manrope 400
                </p>
                <p className="text-base leading-relaxed text-bark-900">
                  A vivid 12-piece acrylic set with a sturdy mixing palette and
                  three flat brushes. Pigments hold under coats of resin and
                  varnish; opacity holds at one stroke.
                </p>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  Caption · Manrope 500 · uppercase
                </p>
                <p className="font-mono text-xs uppercase tracking-[0.4em] text-stone-500">
                  made in hyderabad · open tues–sun
                </p>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
                  Mono · JetBrains Mono · prices + SKU only
                </p>
                <div className="flex items-baseline gap-6">
                  <span className="font-mono text-2xl tabular text-bark-900">
                    ₹680.00
                  </span>
                  <span className="font-mono text-sm tabular text-stone-500">
                    SKU · RES-VLT-100ML
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Buttons */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Buttons
          </h2>
          <Card>
            <CardContent className="space-y-6 p-8">
              <div className="flex flex-wrap items-center gap-4">
                <Button>Shop the studio</Button>
                <Button variant="secondary">Browse</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Delete</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="icon">
                  ★
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Badges */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Badges
          </h2>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-8">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Out of stock</Badge>
              <Badge variant="outline">Outline</Badge>
              <span className="rounded-full bg-moss-100 px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] text-moss-600">
                In stock
              </span>
              <span className="rounded-full bg-saffron-500 px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] text-bark-900">
                Sale
              </span>
              <span className="rounded-full bg-brick-100 px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] text-brick-600">
                Sold out
              </span>
            </CardContent>
          </Card>
        </section>

        {/* Inputs */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Inputs
          </h2>
          <Card>
            <CardContent className="max-w-md space-y-4 p-8">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" placeholder="hello@bhavanicrafts.in" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  placeholder="RES-VLT-100ML"
                  className="font-mono"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cards */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Cards
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Card key={n}>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-display)] text-xl">
                    Resin starter
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-baseline justify-between">
                  <span className="font-mono text-lg tabular text-bark-900">
                    ₹1,240
                  </span>
                  <span className="rounded-full bg-moss-100 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-moss-600">
                    in stock
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Focus state demo */}
        <section>
          <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Focus state (tab through to see)
          </h2>
          <p className="mb-4 text-sm text-stone-500">
            Every interactive element must show a 2px teal-800 focus ring at
            2px offset. Tab through the buttons + input below.
          </p>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-8">
              <Button>Tab here</Button>
              <Input className="max-w-xs" placeholder="and here" />
              <Button variant="outline">and here</Button>
            </CardContent>
          </Card>
        </section>

        <footer className="border-t border-husk-200 py-8 text-center font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
          source: claude/architecture/design-system.md
        </footer>
      </div>
    </div>
  );
}
