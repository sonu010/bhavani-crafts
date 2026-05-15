"use client";

import { notFound, useParams } from "next/navigation";
import { useCartStore, useWishlistStore } from "@/store/cart";
import { useState, useEffect } from "react";
import { Heart, ShoppingBag, ArrowLeft, Star, Sparkles, School, Clock, Users, CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { toast } from "sonner";
import { Product } from "@/lib/products";

// Force dynamic rendering to ensure "not static at all"
export const dynamic = "force-dynamic";

export default function ProductPage() {
  const params = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const { toggle, has } = useWishlistStore();
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setLoading(true);
    // Fetch individual product
    fetch("/api/products")
      .then(res => res.json())
      .then((data: Product[]) => {
        const found = data.find(p => p.id === params.id);
        if (found) {
          setProduct(found);
          setRelated(data.filter(p => p.category === found.category && p.id !== found.id).slice(0, 4));
        } else {
          setProduct(null);
        }
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) return notFound();

  const handleAdd = () => {
    addItem(product, quantity);
    openCart();
    toast.success(`Added to Atelier Bag`, { description: product.name });
  };

  return (
    <div className="min-h-screen bg-background font-sans antialiased pb-24 md:pb-0">
      <main className="max-w-[1440px] mx-auto px-[5vw] pt-32 pb-24">
        {/* Navigation Breadcrumb */}
        <Link href="/products" className="inline-flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-[0.3em] hover:underline mb-12">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Collection
        </Link>

        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start mb-24">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-7 rounded-[3rem] overflow-hidden soft-extrusion aspect-[4/5] md:aspect-[16/10] lg:aspect-[4/5] relative group"
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
          </motion.div>

          <div className="lg:col-span-5 flex flex-col justify-center py-8">
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-6">Intermediate Craft</span>
            <h1 className="font-heading text-5xl md:text-7xl text-on-surface mb-8 italic leading-tight">
              {product.name}
            </h1>
            <p className="text-xl text-on-surface-variant mb-12 leading-relaxed">
              {product.description}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-12">
              <div className="flex flex-col items-center p-6 bg-surface-container rounded-3xl soft-extrusion text-center">
                <School className="w-6 h-6 text-secondary mb-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">Difficulty</span>
                <span className="text-sm font-bold text-on-surface">Intermediate</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-surface-container rounded-3xl soft-extrusion text-center">
                <Clock className="w-6 h-6 text-secondary mb-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">Time</span>
                <span className="text-sm font-bold text-on-surface">4 Hours</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-surface-container rounded-3xl soft-extrusion text-center">
                <Users className="w-6 h-6 text-secondary mb-3" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">Creators</span>
                <span className="text-sm font-bold text-on-surface">1.2k+</span>
              </div>
            </div>

            {/* Bundle Card */}
            <div className="bg-white p-8 rounded-[2.5rem] soft-extrusion border border-outline-variant/10">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-heading text-2xl italic text-on-surface">The Complete Kit</h3>
                <span className="font-heading text-2xl italic text-primary">₹{product.price}</span>
              </div>
              <ul className="space-y-4 mb-10 text-sm text-on-surface-variant">
                {["Premium Materials Included", "Guided Video Tutorial", "Artisan Certification", "Join the Project Feed"].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              
              <div className="flex gap-4">
                <button
                  onClick={handleAdd}
                  className="flex-1 bg-primary text-on-primary h-14 rounded-2xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3"
                >
                  <ShoppingBag className="w-5 h-5" /> Add to Bag
                </button>
                <button
                  onClick={() => toggle(product.id)}
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all",
                    has(product.id) ? "bg-primary border-primary text-white" : "border-outline-variant hover:border-primary text-primary"
                  )}
                >
                  <Heart className={cn("w-6 h-6", has(product.id) && "fill-current")} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Related Creations */}
        {related.length > 0 && (
          <section className="border-t border-outline-variant/20 pt-24">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-4 block">Expand your collection</span>
                <h2 className="font-heading text-5xl italic text-on-surface">Related Materials</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
