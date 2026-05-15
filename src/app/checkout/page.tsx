"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Truck, ShieldCheck, Tag, CheckCircle2, ArrowLeft, CreditCard, Wallet, QrCode } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = ["Shipping", "Payment", "Review"];

export default function CheckoutPage() {
  const { items, totalPrice } = useCartStore();
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("card");

  if (items.length === 0 && step !== 3) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface text-center">
        <h1 className="font-heading text-4xl mb-4 italic text-primary">Your bag is empty</h1>
        <p className="text-on-surface-variant mb-8">Add some artisanal supplies to start your journey.</p>
        <Button asChild className="rounded-full px-8 bg-primary shadow-lg">
          <Link href="/">Back to Shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      {/* Minimal Header */}
      <header className="w-full bg-surface py-6 px-[5vw] border-b border-outline-variant/30 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md">
        <Link href="/" className="font-heading text-2xl text-primary italic font-bold">Bhavani Crafts</Link>
        <Link href="/" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors font-bold text-xs uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4" /> Back to Shop
        </Link>
      </header>

      <main className="max-w-[1440px] mx-auto px-[5vw] py-12 flex flex-col lg:flex-row gap-16">
        {/* Left Column */}
        <div className="flex-1 max-w-3xl">
          {/* Step Indicator */}
          <nav className="mb-12">
            <ol className="flex items-center w-full">
              {STEPS.map((s, i) => (
                <li key={s} className={cn(
                  "flex items-center",
                  i < STEPS.length - 1 ? "w-full" : ""
                )}>
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full font-bold transition-all duration-500",
                    step >= i + 1 ? "bg-primary text-on-primary shadow-lg" : "bg-surface-container text-on-surface-variant/40"
                  )}>
                    {step > i + 1 ? <CheckCircle2 className="w-6 h-6" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-1 mx-4 rounded-full transition-all duration-700",
                      step > i + 1 ? "bg-primary" : "bg-outline-variant/20"
                    )} />
                  )}
                </li>
              ))}
            </ol>
            <div className="flex justify-between mt-4">
              {STEPS.map((s, i) => (
                <span key={s} className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-500",
                  step >= i + 1 ? "text-primary" : "text-on-surface-variant/40"
                )}>
                  {s}
                </span>
              ))}
            </div>
          </nav>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <h1 className="font-heading text-4xl text-on-surface italic">Shipping Details</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">First Name</label>
                    <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Priya" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Last Name</label>
                    <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Sharma" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Address</label>
                    <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Flat No, Street, Landmark" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">City</label>
                    <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Hyderabad" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">PIN Code</label>
                    <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="500076" />
                  </div>
                </div>
                <Button onClick={() => setStep(2)} className="w-full h-14 bg-primary text-on-primary rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all mt-8">
                  Continue to Payment
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <h1 className="font-heading text-4xl text-on-surface italic">Payment Method</h1>
                <div className="space-y-4">
                  {[
                    { id: "card", label: "Credit or Debit Card", icon: <CreditCard className="w-6 h-6" /> },
                    { id: "upi", label: "UPI (Google Pay, PhonePe)", icon: <QrCode className="w-6 h-6" /> },
                    { id: "wallet", label: "Digital Wallets", icon: <Wallet className="w-6 h-6" /> },
                  ].map((m) => (
                    <div 
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      className={cn(
                        "p-6 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group",
                        paymentMethod === m.id ? "bg-surface-container border-primary soft-extrusion" : "bg-surface border-transparent hover:border-outline-variant/30"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                          paymentMethod === m.id ? "border-primary bg-primary" : "border-outline-variant"
                        )}>
                          {paymentMethod === m.id && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        <span className="font-heading text-xl text-on-surface italic">{m.label}</span>
                      </div>
                      <div className={cn(
                        "transition-colors",
                        paymentMethod === m.id ? "text-primary" : "text-on-surface-variant/40"
                      )}>
                        {m.icon}
                      </div>
                    </div>
                  ))}
                </div>

                {paymentMethod === "card" && (
                  <div className="bg-surface p-8 rounded-3xl soft-extrusion border border-outline-variant/10 space-y-6 mt-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Card Number</label>
                      <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 shadow-inner outline-none" placeholder="0000 0000 0000 0000" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Expiry Date</label>
                        <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 shadow-inner outline-none" placeholder="MM/YY" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">CVC</label>
                        <input className="w-full bg-surface-container border-none rounded-xl py-4 px-6 shadow-inner outline-none" placeholder="123" />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-12 pt-8 border-t border-outline-variant/20">
                  <button onClick={() => setStep(1)} className="font-bold text-on-surface-variant hover:text-primary flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Return to Shipping
                  </button>
                  <Button onClick={() => setStep(3)} className="bg-primary text-on-primary rounded-2xl px-12 h-14 font-bold shadow-lg hover:shadow-xl transition-all">
                    Review Order
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <div className="w-24 h-24 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h1 className="font-heading text-5xl text-on-surface mb-4 italic">Order Placed!</h1>
                <p className="text-xl text-on-surface-variant max-w-md mx-auto leading-relaxed mb-12">
                  Your creative supplies are being hand-picked. You'll receive a confirmation on WhatsApp shortly.
                </p>
                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                  <Button asChild className="rounded-full h-12 font-bold bg-primary">
                    <Link href="/">Back to Atelier</Link>
                  </Button>
                  <button className="text-sm font-bold text-on-surface-variant hover:text-primary uppercase tracking-widest transition-colors">
                    Download Receipt
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Order Summary */}
        {step !== 3 && (
          <aside className="w-full lg:w-[450px]">
            <div className="bg-surface-container/50 p-10 rounded-[3rem] sticky top-24 soft-extrusion border border-outline-variant/10">
              <h2 className="font-heading text-3xl italic text-on-surface mb-8">Order Summary</h2>
              
              <div className="space-y-6 mb-10 max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-4">
                    <div className="w-16 h-20 rounded-2xl overflow-hidden shrink-0 bg-surface soft-extrusion">
                      <img src={item.product.image} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <h4 className="text-sm font-bold text-on-surface line-clamp-1">{item.product.name}</h4>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{item.product.category} × {item.quantity}</p>
                      </div>
                      <p className="text-sm font-heading font-bold italic">₹{item.product.price * item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 border-t border-outline-variant/20 pt-8 mb-8">
                <div className="flex justify-between text-on-surface-variant">
                  <span className="text-xs font-bold uppercase tracking-widest">Subtotal</span>
                  <span className="font-heading text-xl italic font-bold text-on-surface">₹{totalPrice()}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span className="text-xs font-bold uppercase tracking-widest">Shipping</span>
                  <span className="text-sm font-bold text-secondary">FREE</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span className="text-xs font-bold uppercase tracking-widest">Estimated Taxes</span>
                  <span className="font-heading text-xl italic font-bold text-on-surface">₹{Math.round(totalPrice() * 0.18)}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-outline-variant/20">
                  <span className="font-heading text-3xl italic text-primary font-bold">Total</span>
                  <span className="font-heading text-3xl italic text-primary font-bold">₹{Math.round(totalPrice() * 1.18)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 pt-4 border-t border-outline-variant/10">
                <div className="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">
                  <ShieldCheck className="w-4 h-4 text-secondary" />
                  <span>100% Secure Transaction</span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
