"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export function BulkEnquirySection() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="bulk" className="bg-accent/40 border-y border-border py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left copy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">For schools, studios & events</p>
            <h2
              className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-5"
              style={{ fontFamily: "var(--font-fraunces, serif)" }}
            >
              Bulk craft orders without the back-and-forth.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-8">
              Share your product list, class size, budget, and date. We&rsquo;ll respond with availability, substitutions, and packaged pricing — fast.
            </p>
            <div className="space-y-3">
              {["School activity kits", "Return gift supplies", "Workshop materials", "Corporate gifting"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-lg">Enquiry received!</p>
                  <p className="text-muted-foreground text-sm mt-1">We&rsquo;ll WhatsApp you back within a few hours with pricing and availability.</p>
                </div>
                <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-2 rounded-xl">
                  Send another enquiry
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="product" className="text-sm font-medium mb-1.5 block">Product or project</Label>
                  <Input
                    id="product"
                    name="product"
                    placeholder="e.g. resin coaster kit for 50 students"
                    required
                    className="rounded-xl h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity" className="text-sm font-medium mb-1.5 block">Quantity</Label>
                    <Input
                      id="quantity"
                      name="quantity"
                      type="number"
                      min="1"
                      placeholder="50"
                      required
                      className="rounded-xl h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget" className="text-sm font-medium mb-1.5 block">Budget (₹)</Label>
                    <Input
                      id="budget"
                      name="budget"
                      type="number"
                      placeholder="5000"
                      className="rounded-xl h-11"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="mobile" className="text-sm font-medium mb-1.5 block">Mobile number</Label>
                  <Input
                    id="mobile"
                    name="mobile"
                    type="tel"
                    placeholder="+91 98765 43210"
                    required
                    className="rounded-xl h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="notes" className="text-sm font-medium mb-1.5 block">Notes</Label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    placeholder="Delivery date, customization, special requirements…"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-semibold">
                  Send bulk enquiry →
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  We also respond on{" "}
                  <a href="https://wa.me/919876543210" className="text-primary hover:underline">
                    WhatsApp
                  </a>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
