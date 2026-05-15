"use client";

import { useState } from "react";
import { PRODUCTS, CATEGORIES } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { Search, SlidersHorizontal, ArrowRight, Sparkles, Filter, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function GalleryPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = PRODUCTS.filter((p) => {
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background font-sans antialiased pt-32 pb-24">
      <div className="max-w-[1440px] mx-auto px-[5vw] flex flex-col lg:flex-row gap-16 relative">
        
        {/* Sidebar Filters (Desktop) */}
        <aside className="hidden lg:flex flex-col gap-10 w-72 sticky top-32 h-fit">
          <div>
            <h2 className="font-heading text-4xl italic text-on-surface mb-2">Supply Studio</h2>
            <p className="text-sm text-on-surface-variant font-medium">Refine your selection</p>
          </div>

          <div className="space-y-8">
            <div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-4 block">Collections</span>
              <nav className="flex flex-col gap-1">
                <button 
                  onClick={() => setActiveCategory("all")}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 text-sm font-bold uppercase tracking-widest",
                    activeCategory === "all" ? "bg-primary text-on-primary shadow-lg" : "text-on-surface-variant hover:bg-surface-container"
                  )}
                >
                  <Sparkles className="w-4 h-4" /> All Materials
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 text-sm font-bold uppercase tracking-widest text-left",
                      activeCategory === cat.id ? "bg-primary text-on-primary shadow-lg" : "text-on-surface-variant hover:bg-surface-container"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-8 rounded-[2rem] bg-secondary/10 border border-secondary/20 relative overflow-hidden">
              <h4 className="font-heading text-xl italic text-secondary mb-3">Join the Atelier</h4>
              <p className="text-xs text-secondary/80 leading-relaxed mb-6 font-medium">Get exclusive access to masterclass materials and early bird drops.</p>
              <button className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:underline underline-offset-4">Learn More</button>
              <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-secondary/10 rounded-full blur-2xl" />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Header & Search */}
          <header className="mb-16">
            <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-12">
              <div className="max-w-xl">
                <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-4 block">Atelier Inventory</span>
                <h1 className="font-heading text-5xl md:text-6xl text-on-surface italic mb-6">Materials for your Masterpiece</h1>
                <p className="text-lg text-on-surface-variant leading-relaxed">Curated, professional-grade supplies hand-selected for their durability and aesthetic excellence.</p>
              </div>
              
              <div className="w-full md:w-80 relative">
                <input
                  type="text"
                  placeholder="Search curated supplies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-full py-4 pl-6 pr-12 text-sm font-medium soft-extrusion outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/40"
                />
                <Search className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
              </div>
            </div>

            {/* Mobile Category Scroll */}
            <div className="lg:hidden overflow-x-auto flex gap-3 pb-6 no-scrollbar">
              <button 
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "whitespace-nowrap px-6 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeCategory === "all" ? "bg-primary text-on-primary shadow-lg" : "bg-surface-container text-on-surface-variant"
                )}
              >
                All
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "whitespace-nowrap px-6 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                    activeCategory === cat.id ? "bg-primary text-on-primary shadow-lg" : "bg-surface-container text-on-surface-variant"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </header>

          {/* Featured Bundle Section */}
          {activeCategory === "all" && !searchQuery && (
            <section className="mb-24 rounded-[3.5rem] overflow-hidden relative soft-extrusion group">
              <div className="aspect-[21/9] relative overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1600&q=80" 
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  alt="Featured Bundle"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-on-surface/80 via-on-surface/40 to-transparent" />
              </div>
              <div className="absolute inset-0 flex flex-col justify-center p-12 md:p-20 text-white max-w-2xl">
                <span className="bg-tertiary text-on-tertiary px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] w-fit mb-6">New Masterclass</span>
                <h2 className="font-heading text-4xl md:text-5xl italic mb-6">Resin Ocean Tray Bundle</h2>
                <p className="text-white/80 text-lg mb-10 leading-relaxed">Everything required to cast, cure, and polish a stunning ocean-inspired serving tray. Includes guided tutorial access.</p>
                <button className="bg-primary text-on-primary px-10 py-4 rounded-full font-bold text-sm w-fit shadow-xl hover:shadow-2xl transition-all flex items-center gap-3 group/btn">
                  Add Bundle - ₹1,499 <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </section>
          )}

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-10 gap-y-16">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, idx) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className={cn(
                    idx % 3 === 1 && "xl:mt-12",
                    idx % 3 === 2 && "xl:mt-24"
                  )}
                >
                  <ProductCard product={product} aspect={idx % 2 === 0 ? "portrait" : "square"} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-32 text-center">
              <p className="font-heading text-3xl italic text-on-surface-variant/40">No materials found in this collection.</p>
              <button onClick={() => { setActiveCategory("all"); setSearchQuery(""); }} className="mt-6 text-primary font-bold hover:underline">Clear all filters</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
