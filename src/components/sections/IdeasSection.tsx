import { ArrowRight, Clock } from "lucide-react";

const IDEAS = [
  {
    title: "How to pour ocean resin coasters at home",
    desc: "Step-by-step guide for beginners. Takes 2 hours, uses ₹400 of supplies.",
    time: "2 hrs",
    image: "https://images.unsplash.com/photo-1619468129361-605ebea04b44?w=600&q=80",
    tag: "Resin Art",
  },
  {
    title: "DIY paper flower wall for festivals",
    desc: "Make a stunning backdrop for Diwali or any celebration with crepe paper flowers.",
    time: "3 hrs",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    tag: "Paper Craft",
  },
  {
    title: "Decoupage MDF tray — beginner project",
    desc: "Transform a plain tray into a beautiful home decor piece with napkins and medium.",
    time: "1.5 hrs",
    image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80",
    tag: "Wood Craft",
  },
  {
    title: "Acrylic pour art on canvas",
    desc: "No skills needed. Just pour, tilt, and let the paint flow into beautiful patterns.",
    time: "1 hr",
    image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&q=80",
    tag: "Paints",
  },
];

export function IdeasSection() {
  return (
    <section id="ideas" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Learn &amp; Make</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
            DIY ideas to spark your next project
          </h2>
        </div>
        <button className="hidden sm:flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All tutorials <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {IDEAS.map((idea) => (
          <article
            key={idea.title}
            className="group cursor-pointer rounded-2xl overflow-hidden border border-border hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div className="relative aspect-video overflow-hidden">
              <img
                src={idea.image}
                alt={idea.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-foreground text-[10px] font-semibold px-2.5 py-1 rounded-full">
                {idea.tag}
              </span>
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground leading-snug mb-2 line-clamp-2">{idea.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{idea.desc}</p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" /> {idea.time}
                </span>
                <span className="text-xs text-primary font-medium group-hover:underline">
                  View project →
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
