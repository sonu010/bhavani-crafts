"use client";

import { useState } from "react";
import { Heart, Eye, ShoppingBag, Star, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useWishlistStore } from "@/store/cart";
import type { Product } from "@/lib/products";
import { toast } from "sonner";
import Link from "next/link";

type Props = { product: Product; className?: string; aspect?: "square" | "portrait" | "wide" };

export function ProductCard({ product, className, aspect = "portrait" }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const { toggle, has } = useWishlistStore();
  const saved = has(product.id);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    openCart();
    toast.success(`Added to Atelier Bag`, { 
      description: product.name,
      className: "font-sans font-bold" 
    });
  };

  const aspectClass = {
    square: "aspect-square",
    portrait: "aspect-[4/5]",
    wide: "aspect-[16/10]"
  }[aspect];

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        "group relative flex flex-col h-full rounded-[2rem] bg-surface overflow-hidden transition-all duration-500 hover:-translate-y-2 tactile-card",
        className
      )}
    >
      {/* Image Container */}
      <div className={cn("relative overflow-hidden bg-surface-container-low p-4", aspectClass)}>
        <Link href={`/products/${product.id}`} className="block w-full h-full relative overflow-hidden rounded-2xl">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </Link>
        
        {/* Badges */}
        <div className="absolute top-6 left-6 flex flex-col gap-2">
          {product.badge && (
            <span className="bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm">
              {product.badge}
            </span>
          )}
        </div>

        {/* Floating Actions */}
        <div className="absolute top-6 right-6 flex flex-col gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
          <button
            onClick={() => toggle(product.id)}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-300",
              saved 
                ? "bg-primary text-on-primary border-primary shadow-lg" 
                : "bg-white/80 text-on-surface border-white/20 hover:bg-white"
            )}
          >
            <Heart className={cn("w-4 h-4", saved && "fill-current")} />
          </button>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-8 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-1">
              {product.category}
            </span>
            <Link href={`/products/${product.id}`}>
              <h3 className="font-heading text-2xl text-on-surface leading-tight hover:text-primary transition-colors line-clamp-1 italic">
                {product.name}
              </h3>
            </Link>
          </div>
          <span className="text-xl font-heading italic text-primary">₹{product.price}</span>
        </div>

        <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2 mb-8 flex-1">
          {product.description}
        </p>

        <div className="flex flex-col gap-4 mt-auto">
          {/* Seen in: Indicator (Branding) */}
          <div className="flex items-center gap-2 bg-surface-container/50 px-4 py-2.5 rounded-xl border border-outline-variant/30">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Seen in: Artisanal Series
            </span>
          </div>

          <button
            onClick={handleAdd}
            className="w-full bg-primary text-on-primary font-bold text-sm py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 group/btn"
          >
            <ShoppingBag className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
            Add to Atelier Bag
          </button>
        </div>
      </div>
    </motion.article>
  );
}
