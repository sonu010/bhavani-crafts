"use client";

import { useState, useEffect } from "react";
import { Product, CATEGORIES } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { Search, Sparkles, ArrowLeft, Filter, SlidersHorizontal, Package, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        setLoading(false);
      });
  }, []);

  const filtered = products.filter((p) => {
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background font-sans antialiased pt-32 pb-24">
      <main className="max-w-[1440px] mx-auto px-[5vw]">
        {/* Navigation Breadcrumb */}
        <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-[0.3em] hover:underline mb-12">
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Atelier
        </Link>

        <header className="mb-20">
          <div className="flex flex-col lg:flex-row justify-between items-end gap-12">
            <div className="max-w-2xl">
              <h1 className="font-heading text-6xl md:text-8xl text-on-surface italic mb-8 leading-tight">The Materials Collection</h1>
              <p className="text-xl text-on-surface-variant leading-relaxed">
                Every material in our atelier is hand-vetted for quality, sustainability, and tactile excellence. From heritage muds to modern resins.
              </p>
            </div>
            
            <div className="w-full lg:w-96 relative group">
              <input
                type="text"
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container border-none rounded-full py-6 pl-10 pr-16 text-lg soft-extrusion outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/30"
              />
              <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-on-surface-variant/20 group-focus-within:text-primary transition-colors" />
            </div>
          </div>
        </header>

        {/* Category Strip */}
        <div className="flex flex-wrap gap-3 mb-16 border-b border-outline-variant/10 pb-12">
          <button 
            onClick={() => setActiveCategory("all")}
            className={cn(
              "px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
              activeCategory === "all" ? "bg-primary text-on-primary shadow-xl" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            All Collections
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                activeCategory === cat.id ? "bg-primary text-on-primary shadow-xl" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Dynamic Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-12 gap-y-20">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, idx) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, delay: idx * 0.05 }}
              >
                <ProductCard product={product} aspect={idx % 3 === 0 ? "portrait" : "square"} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="py-40 text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-6" />
            <p className="font-heading text-3xl italic text-on-surface-variant/40">Curating the gallery...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-40 text-center space-y-8">
            <div className="w-24 h-24 bg-surface-container rounded-full flex items-center justify-center mx-auto opacity-20">
              <Package className="w-12 h-12" />
            </div>
            <div>
              <p className="font-heading text-4xl italic text-on-surface-variant/40 mb-4">No materials found matching your search.</p>
              <button 
                onClick={() => { setActiveCategory("all"); setSearchQuery(""); }} 
                className="text-primary font-bold hover:underline uppercase tracking-widest text-xs"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
