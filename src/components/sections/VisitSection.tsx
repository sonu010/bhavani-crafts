import { MapPin, Clock, Phone, MessageCircle } from "lucide-react";

const DETAILS = [
  { icon: Clock, label: "Store hours", value: "Mon–Sat, 10:30 AM – 8:00 PM" },
  { icon: MapPin, label: "Location", value: "kachiguda, Hyderabad, Telangana" },
  { icon: Phone, label: "Phone", value: "+91 98765 43210", href: "tel:+919876543210" },
  { icon: MessageCircle, label: "WhatsApp", value: "Chat for orders & stock checks", href: "https://wa.me/919876543210" },
];

export function VisitSection() {
  return (
    <section id="visit" className="bg-foreground py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Online + local store</p>
            <h2
              className="text-3xl font-bold text-white leading-tight mb-5"
              style={{ fontFamily: "var(--font-fraunces, serif)" }}
            >
              Visit Bhavani Crafts in Hyderabad
            </h2>
            <p className="text-white/60 leading-relaxed mb-8">
              Use the website for discovery, stock checks, and repeat orders. The physical shop adds the local trust that converts online browsers into buyers.
            </p>
            <div className="space-y-4">
              {DETAILS.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 font-medium uppercase tracking-wide">{label}</p>
                    {href ? (
                      <a href={href} className="text-sm text-white font-medium hover:text-primary transition mt-0.5 block">
                        {value}
                      </a>
                    ) : (
                      <p className="text-sm text-white font-medium mt-0.5">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-2xl overflow-hidden aspect-video lg:aspect-auto lg:h-80">
            <img
              src="https://images.unsplash.com/photo-1551836022-b06985bceb24?w=800&q=80"
              alt="Bhavani Crafts store interior with art supplies"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-primary/20" />
            <div className="absolute bottom-4 left-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3">
              <p className="text-white text-sm font-semibold">Bhavani Crafts, kachiguda</p>
              <p className="text-white/70 text-xs mt-0.5">Hyderabad&rsquo;s favourite craft store</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
