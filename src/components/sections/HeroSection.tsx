"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    id: 1,
    tag: "Hyderabad's favourite craft store",
    headline: "Everything for your next resin art project.",
    sub: "Premium silicone molds, mica pigments, epoxy resins, and mixing tools — all in one place.",
    cta: { label: "Shop Resin Art", href: "/#allProducts" },
    ctaSecondary: { label: "View kits", href: "/#kits" },
    image: "https://images.unsplash.com/photo-1617325247935-2430dde0c94d?auto=format&fit=crop&w=1600&q=80",
    accent: "from-emerald-950/95 via-emerald-900/60 to-transparent",
  },
  {
    id: 2,
    tag: "Perfect for beginners & hobbyists",
    headline: "Craft kits that make learning hands-on.",
    sub: "Festival kits, candle-making boxes, decoupage trays — step-by-step projects for every skill level.",
    cta: { label: "Browse DIY Kits", href: "/#kits" },
    ctaSecondary: { label: "Get ideas", href: "/#ideas" },
    image: "https://images.unsplash.com/photo-1596003903581-8a3b483b87bf?auto=format&fit=crop&w=1600&q=80",
    accent: "from-rose-950/95 via-rose-900/60 to-transparent",
  },
  {
    id: 3,
    tag: "Bulk orders welcome",
    headline: "School projects, events & bulk craft supplies.",
    sub: "Chart paper, foam sheets, glitter, art stationery — we supply schools, events, and businesses across Hyderabad.",
    cta: { label: "Get bulk rates", href: "/#bulk" },
    ctaSecondary: { label: "WhatsApp us", href: "https://wa.me/919876543210" },
    image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1600&q=80",
    accent: "from-amber-950/95 via-amber-900/60 to-transparent",
  },
];

export function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDES.length), []);
  const prev = () => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(next, 5500);
    return () => clearInterval(timer);
  }, [paused, next]);

  const slide = SLIDES[current];

  return (
    <section
      className="relative min-h-[90vh] flex items-center overflow-hidden bg-foreground"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      id="home"
    >
      {/* Background images with crossfade */}
      <AnimatePresence mode="sync">
        <motion.img
          key={slide.id}
          src={slide.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 0.38, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
        />
      </AnimatePresence>

      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-r ${slide.accent}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      {/* Slide indicator dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`transition-all duration-300 rounded-full ${i === current ? "w-8 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"}`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Prev / Next arrows */}
      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center backdrop-blur-sm transition"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center backdrop-blur-sm transition"
        aria-label="Next slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-28 w-full z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.55 }}
            className="max-w-xl"
          >
            <span className="inline-flex items-center gap-1.5 bg-white/10 text-white/90 border border-white/20 rounded-full px-3.5 py-1.5 text-xs font-semibold mb-6 backdrop-blur-sm">
              ✦ {slide.tag}
            </span>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5"
            >
              {slide.headline}
            </h1>

            <p className="text-white/70 text-base sm:text-lg leading-relaxed mb-8 max-w-md">
              {slide.sub}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 px-7 rounded-xl text-sm font-semibold shadow-lg">
                <Link href={slide.cta.href}>
                  {slide.cta.label} <ArrowRight className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 px-7 rounded-xl text-sm font-semibold bg-white/10 border-white/25 text-white hover:bg-white/20 backdrop-blur-sm"
              >
                <Link href={slide.ctaSecondary.href}>{slide.ctaSecondary.label}</Link>
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slide counter */}
        <div className="absolute top-8 right-6 text-white/40 text-xs font-medium tabular-nums">
          {String(current + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
        </div>
      </div>
    </section>
  );
}
