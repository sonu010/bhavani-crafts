"use client";

import { useCartStore } from "@/store/cart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Lock, Store, Truck } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalPrice, totalItems } = useCartStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-surface border-l border-outline-variant/30">
        <SheetHeader className="px-8 py-8 border-b border-outline-variant/20">
          <SheetTitle className="flex items-center gap-3 font-heading text-3xl italic text-primary">
            <ShoppingBag className="w-6 h-6" />
            Atelier Bag
            {totalItems() > 0 && (
              <span className="ml-auto text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full uppercase tracking-widest">
                {totalItems()} Items
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center bg-surface-container/30">
            <div className="w-24 h-24 rounded-full bg-surface soft-extrusion flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-on-surface-variant/40" />
            </div>
            <div>
              <p className="font-heading text-2xl text-on-surface italic">Your bag is empty</p>
              <p className="text-sm text-on-surface-variant mt-2 max-w-[200px] mx-auto">Start your next masterpiece by adding some premium supplies.</p>
            </div>
            <Button variant="outline" onClick={closeCart} className="rounded-full px-8 font-bold border-primary text-primary hover:bg-primary/5" asChild>
              <Link href="/#all-products">Explore Materials</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              <AnimatePresence mode="popLayout">
                {items.map(({ product, quantity }) => (
                  <motion.div 
                    key={product.id} 
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex gap-4 group"
                  >
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-surface-container-highest soft-extrusion">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-bold text-on-surface leading-tight line-clamp-1">{product.name}</p>
                          <button
                            onClick={() => removeItem(product.id)}
                            className="text-on-surface-variant hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">{product.category}</p>
                      </div>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1 bg-surface-container rounded-lg p-0.5 border border-outline-variant/30">
                          <button
                            className="w-7 h-7 flex items-center justify-center hover:bg-surface transition rounded-md"
                            onClick={() => updateQuantity(product.id, quantity - 1)}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold">{quantity}</span>
                          <button
                            className="w-7 h-7 flex items-center justify-center hover:bg-surface transition rounded-md"
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-sm font-heading font-bold text-primary italic">₹{product.price * quantity}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="border-t border-outline-variant/20 px-8 py-8 bg-surface-variant/10 space-y-6">
              {/* Free shipping progress */}
              {totalPrice() < 999 ? (
                <div className="bg-surface p-4 rounded-2xl soft-extrusion">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                    <span>Add ₹{999 - totalPrice()} more for free shipping</span>
                    <span>Goal: ₹999</span>
                  </div>
                  <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((totalPrice() / 999) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-secondary/10 p-3 rounded-xl flex items-center gap-3 text-secondary border border-secondary/20">
                  <Truck className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">You've unlocked free shipping!</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-on-surface-variant">
                  <span className="text-xs font-bold uppercase tracking-widest">Subtotal</span>
                  <span className="font-heading text-xl italic font-bold text-on-surface">₹{totalPrice()}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant/60 italic uppercase tracking-wider">Taxes & shipping calculated at next step</p>
              </div>

              <div className="flex flex-col gap-3">
                <Link href="/checkout" onClick={closeCart} className="block w-full">
                  <Button className="w-full h-14 text-sm font-bold rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all gap-2 group/btn">
                    Secure Checkout <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full h-10 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" onClick={closeCart}>
                  Continue Browsing
                </Button>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                <Lock className="w-3 h-3" />
                <span>Encrypted & Secure</span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
