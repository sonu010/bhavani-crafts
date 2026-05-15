import Link from "next/link";
import { Camera, MessageCircle, Phone, Mail, MapPin, ArrowRight } from "lucide-react";

const SHOP_LINKS = [
  { href: "/#categories", label: "Categories" },
  { href: "/#kits", label: "Project Kits" },
  { href: "/#gallery", label: "Materials Gallery" },
  { href: "/#feed", label: "Community Feed" },
];

const HELP_LINKS = [
  { href: "/#track", label: "Track order" },
  { href: "/#bulk", label: "Wholesale Enquiry" },
  { href: "/#visit", label: "Store details" },
  { href: "#", label: "Returns policy" },
];

export function Footer() {
  return (
    <footer className="bg-surface-variant/30 text-on-surface mt-24 border-t border-outline-variant/50">
      {/* Newsletter / CTA Section */}
      <div className="max-w-7xl mx-auto px-6 py-16 border-b border-outline-variant/30">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-heading text-3xl font-medium mb-4 text-primary italic">Join the Creator Studio</h2>
            <p className="text-on-surface-variant max-w-md">Get monthly inspiration, new material alerts, and artisanal techniques delivered to your inbox.</p>
          </div>
          <div className="relative">
            <input 
              type="email" 
              placeholder="your@email.com" 
              className="w-full bg-surface text-on-surface border-none rounded-full py-4 pl-8 pr-32 soft-extrusion outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary px-6 py-2.5 rounded-full font-button text-sm flex items-center gap-2 hover:shadow-lg transition-all">
              Join <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-on-primary font-bold text-xs">BC</span>
              </div>
              <span className="font-heading italic text-xl font-bold text-primary">Bhavani Crafts</span>
            </Link>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-8">
              A tactile haven for modern creators. Curating premium supplies and artisanal kits for the hands-on journey.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-on-surface-variant hover:text-primary hover:soft-extrusion transition-all border border-outline-variant/30">
                <Camera className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-on-surface-variant hover:text-primary hover:soft-extrusion transition-all border border-outline-variant/30">
                <MessageCircle className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="font-label-caps text-label-caps text-primary/60 mb-6 uppercase tracking-widest">Collections</h3>
            <ul className="space-y-3">
              {SHOP_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-on-surface-variant hover:text-primary transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h3 className="font-label-caps text-label-caps text-primary/60 mb-6 uppercase tracking-widest">Support</h3>
            <ul className="space-y-3">
              {HELP_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-on-surface-variant hover:text-primary transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-label-caps text-label-caps text-primary/60 mb-6 uppercase tracking-widest">Atelier</h3>
            <ul className="space-y-4">
              <li>
                <a href="tel:+919876543210" className="flex items-center gap-3 text-sm text-on-surface-variant hover:text-primary transition-colors">
                  <Phone className="w-4 h-4 opacity-50" />
                  +91 98765 43210
                </a>
              </li>
              <li>
                <a href="mailto:hello@bhavanicrafts.in" className="flex items-center gap-3 text-sm text-on-surface-variant hover:text-primary transition-colors">
                  <Mail className="w-4 h-4 opacity-50" />
                  hello@bhavanicrafts.in
                </a>
              </li>
              <li className="flex items-start gap-3 text-sm text-on-surface-variant">
                <MapPin className="w-4 h-4 mt-0.5 opacity-50" />
                <span>kachiguda, Hyderabad<br/><span className="text-[10px] opacity-60">Mon–Sat, 10:30 AM – 8 PM</span></span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-outline-variant/30 mt-16 pt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-[11px] font-medium text-on-surface-variant/60 uppercase tracking-widest">
            © {new Date().getFullYear()} Bhavani Crafts Studio. All rights reserved.
          </p>
          <div className="flex gap-8">
            <Link href="#" className="text-[10px] font-bold text-on-surface-variant/40 hover:text-primary transition-colors uppercase tracking-widest">Privacy</Link>
            <Link href="#" className="text-[10px] font-bold text-on-surface-variant/40 hover:text-primary transition-colors uppercase tracking-widest">Terms</Link>
          </div>
        </div>
      </div>
      
      {/* Mobile Spacer (for bottom nav) */}
      <div className="h-20 md:hidden"></div>
    </footer>
  );
}
