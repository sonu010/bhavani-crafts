"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingCart, Star, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore, useWishlistStore } from "@/store/cart";
import type { Product } from "@/lib/products";
import { toast } from "sonner";

type Props = { product: Product; open: boolean; onOpenChange: (open: boolean) => void };

export function QuickViewDialog({ product, open, onOpenChange }: Props) {
  const [qty, setQty] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const { toggle, has } = useWishlistStore();
  const saved = has(product.id);

  const handleAdd = () => {
    addItem(product, qty);
    openCart();
    onOpenChange(false);
    toast.success(`Added to cart`, { description: `${qty}× ${product.name}` });
  };

  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 rounded-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-square sm:aspect-auto bg-muted/30">
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
            {product.badge && (
              <Badge className="absolute top-4 left-4 text-xs">{product.badge}</Badge>
            )}
          </div>

          {/* Details */}
          <div className="p-6 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 capitalize">
              {product.category}
            </p>
            <h2 className="text-xl font-bold text-foreground leading-tight mb-3">{product.name}</h2>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "w-4 h-4",
                      i < Math.floor(product.rating) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">{product.rating} · {product.reviews} reviews</span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-5">{product.description}</p>

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-2xl font-bold text-foreground">₹{product.price}</span>
              {product.originalPrice && (
                <>
                  <span className="text-sm text-muted-foreground line-through">₹{product.originalPrice}</span>
                  <Badge variant="destructive" className="text-xs">-{discount}%</Badge>
                </>
              )}
            </div>

            {/* Qty */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center border border-border rounded-xl overflow-hidden">
                <button
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                <button
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition"
                  onClick={() => setQty(qty + 1)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">Total: ₹{product.price * qty}</span>
            </div>

            <Button onClick={handleAdd} className="h-11 rounded-xl font-semibold mb-3">
              <ShoppingCart className="w-4 h-4 mr-2" /> Add to cart
            </Button>

            <button
              onClick={() => toggle(product.id)}
              className={cn(
                "flex items-center justify-center gap-2 h-10 rounded-xl border text-sm font-medium transition",
                saved
                  ? "border-rose-300 bg-rose-50 text-rose-600"
                  : "border-border text-muted-foreground hover:border-rose-300 hover:text-rose-500"
              )}
            >
              <Heart className={cn("w-4 h-4", saved && "fill-current")} />
              {saved ? "Saved to wishlist" : "Save to wishlist"}
            </button>

            {/* Tags */}
            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t">
                {product.tags.map((tag) => (
                  <span key={tag} className="text-[11px] text-muted-foreground border border-border rounded-lg px-2 py-1">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
