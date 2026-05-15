import { Truck, Shield, Clock, BadgeCheck } from "lucide-react";

const ITEMS = [
  { icon: Truck, label: "Free shipping", sub: "On orders above ₹999", color: "bg-emerald-50 text-emerald-700" },
  { icon: Clock, label: "Same-day dispatch", sub: "For in-stock items", color: "bg-amber-50 text-amber-700" },
  { icon: Shield, label: "Fragile-safe packing", sub: "Molds, bottles & glass", color: "bg-blue-50 text-blue-700" },
  { icon: BadgeCheck, label: "Local Hyderabad shop", sub: "Chat before buying", color: "bg-rose-50 text-rose-700" },
];

export function TrustBar() {
  return (
    <section className="border-b border-border bg-gradient-to-r from-amber-50 via-white to-amber-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {ITEMS.map(({ icon: Icon, label, sub, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
