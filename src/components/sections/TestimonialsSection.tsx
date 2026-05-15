import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "Best range for resin, canvas, molds, colors, papers, and school craft work. Staff helped me choose the right material and even shared tips.",
    name: "Priya M.",
    role: "Hobbyist crafter",
    stars: 5,
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&q=80",
  },
  {
    quote: "Best for last-minute project supplies. I could message on WhatsApp and confirm stock before visiting — saved me so much time.",
    name: "Rohit K.",
    role: "DIY enthusiast",
    stars: 5,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80",
  },
  {
    quote: "Bulk craft kits were packed neatly for our art workshop. Pricing was transparent and delivery was on time. Will order again.",
    name: "Sravani A.",
    role: "Art studio owner",
    stars: 5,
    image: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=100&q=80",
  },
];

export function TestimonialsSection() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Crafter love</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
          Over 10,000 happy crafters
        </h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="bg-white border border-border rounded-2xl p-6 hover:shadow-md hover:border-primary/30 transition-all"
          >
            {/* Stars */}
            <div className="flex gap-0.5 mb-4">
              {Array.from({ length: t.stars }).map((_, i) => (
                <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <blockquote className="text-sm text-muted-foreground leading-relaxed mb-5 italic">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="flex items-center gap-3">
              <img
                src={t.image}
                alt={t.name}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
