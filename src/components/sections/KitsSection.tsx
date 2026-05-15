import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const KITS = [
  {
    name: "Resin Coaster Kit",
    desc: "Silicone molds, epoxy resin, pigments, mixing cups. Everything in one box.",
    price: 899,
    image: "https://images.unsplash.com/photo-1619468129361-605ebea04b44?w=600&q=80",
    badge: "Most Popular",
  },
  {
    name: "Paper Flower Kit",
    desc: "Crepe paper, floral wire, scissors, and a step-by-step project card.",
    price: 299,
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    badge: "Great for Beginners",
  },
  {
    name: "Decoupage Tray Kit",
    desc: "MDF tray, decoupage medium, napkins, brush, and sealer.",
    price: 649,
    image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80",
    badge: "Best Gift",
  },
];

export function KitsSection() {
  return (
    <section id="kits" className="bg-foreground py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Project-led shopping</p>
            <h2
              className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-5"
              style={{ fontFamily: "var(--font-fraunces, serif)" }}
            >
              Ready kits that make crafting easy.
            </h2>
            <p className="text-white/60 text-base leading-relaxed mb-8 max-w-md">
              Bundle products into beginner-friendly projects: resin coasters, festival decor, school charts, handmade return gifts, and decoupage trays.
            </p>
            <Button asChild className="h-11 px-6 rounded-xl font-semibold">
              <Link href="#bulk">
                Build a custom kit <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          {/* Kit cards */}
          <div className="space-y-4">
            {KITS.map((kit) => (
              <div
                key={kit.name}
                className="flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 transition group cursor-pointer"
              >
                <img
                  src={kit.image}
                  alt={kit.name}
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{kit.name}</p>
                      <p className="text-white/50 text-xs mt-0.5 line-clamp-1">{kit.desc}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white font-bold text-sm">₹{kit.price}</p>
                    </div>
                  </div>
                  <span className="inline-block mt-2 text-[10px] font-medium text-primary bg-primary/20 border border-primary/30 px-2 py-0.5 rounded-full">
                    {kit.badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
