"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, ShoppingBag, MessageSquare, Compass, PlaySquare, Sparkles, User, Menu, X } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/#categories", label: "Categories" },
  { href: "/#kits", label: "Project Kits" },
  { href: "/#visit", label: "Visit Store" },
  { href: "/#bulk", label: "Wholesale" },
];

export function Navbar() {
  const totalItems = useCartStore((s) => s.totalItems());
  const openCart = useCartStore((s) => s.openCart);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Desktop Navigation */}
      <nav
        className={cn(
          "hidden md:flex fixed top-0 left-0 w-full z-50 justify-between items-center px-12 py-4 transition-all duration-300 border-b",
          scrolled
            ? "bg-background/95 backdrop-blur-md border-outline-variant shadow-sm py-3"
            : "bg-background border-transparent py-5"
        )}
      >
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <span className="text-on-primary font-bold text-sm">BC</span>
          </div>
          <div className="flex flex-col">
            <span className="font-heading italic text-xl font-bold text-primary leading-tight">Bhavani Crafts</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold leading-none">Artisanal Studio</span>
          </div>
        </Link>

        <div className="flex gap-8 items-center">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors duration-300"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <button aria-label="Search" className="text-on-surface-variant hover:text-primary transition-colors">
            <Search className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => openCart()}
            className="relative p-2 text-on-surface-variant hover:text-primary transition-colors"
            aria-label="Open cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>

          <button className="bg-primary text-on-primary font-button text-button px-6 py-2.5 rounded-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 shadow-sm">
            Suggest a project
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 pb-safe-area bg-surface/80 backdrop-blur-md rounded-t-2xl border-t border-outline-variant shadow-[0_-4px_20px_rgba(145,70,49,0.08)]">
        <Link href="/" className={cn(
          "flex flex-col items-center justify-center px-4 py-2 rounded-xl transition-all duration-200",
          pathname === "/" ? "bg-primary/10 text-primary scale-95 soft-extrusion" : "text-on-surface-variant"
        )}>
          <Compass className={cn("w-5 h-5", pathname === "/" && "fill-primary/20")} />
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Discover</span>
        </Link>
        
        <Link href="/feed" className="flex flex-col items-center justify-center px-4 py-2 text-on-surface-variant">
          <PlaySquare className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Feed</span>
        </Link>
        
        <Link href="/makes" className="flex flex-col items-center justify-center px-4 py-2 text-on-surface-variant">
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Makes</span>
        </Link>
        
        <Link href="/login" className="flex flex-col items-center justify-center px-4 py-2 text-on-surface-variant">
          <User className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Profile</span>
        </Link>
        
        <button
          onClick={() => openCart()}
          className="relative flex flex-col items-center justify-center px-4 py-2 text-on-surface-variant"
        >
          <ShoppingBag className="w-5 h-5" />
          {totalItems > 0 && (
            <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">
              {totalItems}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Cart</span>
        </button>
      </nav>

      {/* Mobile Top Bar (Logo Only) */}
      <div className="md:hidden fixed top-0 left-0 w-full z-50 bg-background/80 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-outline-variant">
        <Link href="/" className="font-heading italic text-lg font-bold text-primary">
          Bhavani Crafts
        </Link>
        <button className="text-on-surface-variant p-1">
          <Search className="w-5 h-5" />
        </button>
      </div>
    </>
  );
}
