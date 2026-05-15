import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { NEW_ARRIVALS } from "@/lib/products";
import { ArrowRight } from "lucide-react";

export function NewArrivalsSection() {
  return (
    <section id="new" className="bg-muted/40 border-y border-border py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Fresh in stock</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
              New arrivals
            </h2>
          </div>
          <Link href="#allProducts" className="hidden sm:flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {NEW_ARRIVALS.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
