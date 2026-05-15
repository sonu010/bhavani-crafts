import Link from "next/link";
import { CATEGORIES } from "@/lib/products";
import { ArrowRight } from "lucide-react";

export function CategoriesSection() {
  return (
    <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Find your craft</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
            What will you make today?
          </h2>
        </div>
        <Link href="#allProducts" className="hidden sm:flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All categories <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={`/#allProducts`}
            className="group relative rounded-2xl overflow-hidden aspect-[3/4] flex flex-col justify-end"
          >
            <img
              src={cat.image}
              alt={cat.label}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="relative p-4">
              <p className="text-2xl mb-1">{cat.icon}</p>
              <p className="text-white font-semibold text-sm leading-tight">{cat.label}</p>
              <p className="text-white/70 text-[11px] mt-0.5">{cat.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
