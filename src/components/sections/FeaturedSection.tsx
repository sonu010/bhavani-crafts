"use client";

import { useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { PRODUCTS } from "@/lib/products";
import type { Category } from "@/lib/products";
import { cn } from "@/lib/utils";

const FILTERS: { label: string; value: "all" | Category }[] = [
  { label: "All", value: "all" },
  { label: "Resin", value: "resin" },
  { label: "Paper", value: "paper" },
  { label: "Paints", value: "paints" },
  { label: "DIY", value: "diy" },
  { label: "Wood", value: "wood" },
  { label: "School", value: "school" },
];

export function FeaturedSection() {
  const [active, setActive] = useState<"all" | Category>("all");

  const filtered = active === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === active);

  return (
    <section id="allProducts" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Our collection</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-5" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
          Handpicked for crafters
        </h2>
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActive(f.value)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition border",
                active === f.value
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
