"use client";

import { Search, ArrowRight, Droplets, DraftingCompass, Gift, Armchair, Play, Sparkles, MapPin, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { Product, CATEGORIES } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(data => setFeaturedProducts(data.slice(0, 4)));
  }, []);

  return (
    <main className="max-w-[1440px] mx-auto pt-8 md:pt-32 font-sans overflow-x-hidden">
      {/* Hero Section */}
      <section className="px-[5vw] py-20 flex flex-col items-center text-center">
        <h1 className="font-heading text-5xl md:text-7xl text-on-surface mb-8 max-w-4xl tracking-tight leading-[1.1] italic">
          What do you want to create today?
        </h1>
        <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mb-12 leading-relaxed">
          Discover artisanal kits, premium materials, and guided projects to bring your tactile ideas to life.
        </p>
        <div className="w-full max-w-2xl relative group">
          <input
            className="w-full bg-surface-container border-none text-on-surface text-lg rounded-full py-6 pl-10 pr-20 soft-extrusion outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/40"
            placeholder="Search for 'Resin Ocean Tray' or 'Lippan Art'..."
            type="text"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary text-on-primary rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* Creative Categories */}
      <section className="px-[5vw] py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: "Resin Art", image: "https://images.unsplash.com/photo-1635350736475-c8cef4b21906?w=800&q=80", icon: <Droplets className="w-5 h-5" />, offset: false },
            { label: "Lippan Art", image: "https://images.unsplash.com/photo-1596003903581-8a3b483b87bf?w=800&q=80", icon: <DraftingCompass className="w-5 h-5" />, offset: true },
            { label: "DIY Gifts", image: "https://images.unsplash.com/photo-1520004434532-6684162097ec?w=800&q=80", icon: <Gift className="w-5 h-5" />, offset: false },
            { label: "Home Decor", image: "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?w=800&q=80", icon: <Armchair className="w-5 h-5" />, offset: true },
          ].map((cat, idx) => (
            <Link
              key={cat.label}
              href={`/products`}
              className={cn(
                "group relative block aspect-[3/4] rounded-3xl overflow-hidden tactile-card transition-all duration-700",
                cat.offset && "lg:mt-12"
              )}
            >
              <img
                src={cat.image}
                alt={cat.label}
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-1000 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-on-surface/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 w-full flex justify-between items-end">
                <h3 className="font-heading text-3xl text-white italic">{cat.label}</h3>
                <span className="bg-white/20 backdrop-blur-md text-white rounded-full w-12 h-12 flex items-center justify-center border border-white/30 group-hover:bg-primary group-hover:border-primary transition-all duration-500">
                  <ArrowRight className="w-5 h-5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Immersive Story Break */}
      <section className="w-full h-[600px] my-24 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1600&q=80"
          alt="Artisan Studio"
          className="w-full h-full object-cover scale-105"
        />
        <div className="absolute inset-0 bg-on-surface/30 flex items-center justify-center p-8">
          <div className="bg-surface/90 backdrop-blur-md p-12 md:p-20 rounded-[3rem] text-center max-w-2xl soft-extrusion">
            <h2 className="font-heading text-4xl md:text-6xl text-on-surface mb-8 italic">The Joy of Making</h2>
            <p className="text-lg md:text-xl text-on-surface-variant leading-relaxed mb-10">
              Step away from the screen and reconnect with your hands. Our curated kits provide everything you need to experience the meditative process of heritage crafts.
            </p>
            <button className="bg-primary text-on-primary px-10 py-4 rounded-full font-bold text-lg hover:shadow-2xl hover:-translate-y-1 transition-all">
              Discover Kits
            </button>
          </div>
        </div>
      </section>

      {/* Featured Products Gallery */}
      <section className="px-[5vw] py-20 bg-surface-variant/20">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div>
            <span className="font-label-caps text-primary uppercase tracking-[0.2em] font-bold mb-4 block">Shop the Atelier</span>
            <h2 className="font-heading text-5xl text-on-surface italic">Premium Materials</h2>
          </div>
          <Link href="/products" className="group flex items-center gap-3 text-primary font-bold hover:gap-5 transition-all">
            Browse Full Collection <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Community Feed Preview */}
      <section className="px-[5vw] py-24">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div className="relative">
            <div className="aspect-square rounded-[4rem] overflow-hidden soft-extrusion border-[12px] border-surface">
              <img 
                src="https://images.unsplash.com/photo-1617325247935-2430dde0c94d?w=1000&q=80" 
                className="w-full h-full object-cover"
                alt="Community work"
              />
            </div>
            <div className="absolute -bottom-10 -right-10 bg-secondary text-on-secondary p-10 rounded-[3rem] shadow-2xl max-w-xs hidden md:block">
              <p className="font-heading text-2xl italic mb-4">"A haven for every creator in Hyderabad."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface/20" />
                <span className="font-bold text-sm uppercase tracking-widest">Anita R.</span>
              </div>
            </div>
          </div>
          <div>
            <h2 className="font-heading text-5xl text-on-surface mb-8 italic">Join the Artisan Journey</h2>
            <p className="text-xl text-on-surface-variant leading-relaxed mb-12">
              Share your progress, learn from masters, and get recognized for your craft. Our creator studio is more than a store—it's a community.
            </p>
            <div className="grid grid-cols-2 gap-6 mb-12">
              <div className="p-8 rounded-3xl bg-surface-container soft-extrusion">
                <span className="text-4xl mb-4 block">✨</span>
                <h4 className="font-bold text-lg mb-2">Showcase Your Work</h4>
                <p className="text-sm text-on-surface-variant">Upload photos of your completed kits and get featured.</p>
              </div>
              <div className="p-8 rounded-3xl bg-surface-container soft-extrusion">
                <span className="text-4xl mb-4 block">🎓</span>
                <h4 className="font-bold text-lg mb-2">Masterclass Access</h4>
                <p className="text-sm text-on-surface-variant">Exclusive video guides for advanced techniques.</p>
              </div>
            </div>
            <Link href="/feed">
              <button className="bg-primary text-on-primary px-10 py-4 rounded-full font-bold text-lg hover:shadow-2xl transition-all">
                Enter Creator Studio
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Advantage Split */}
      <section className="px-[5vw] py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">
        <div className="bg-secondary text-on-secondary rounded-[3rem] p-12 flex flex-col justify-between overflow-hidden relative group min-h-[450px]">
          <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-all duration-1000">
            <img src="https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1200&q=80" className="w-full h-full object-cover" />
          </div>
          <div className="relative z-10">
            <span className="bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full text-xs font-bold uppercase tracking-[0.2em] inline-block mb-8">Local Experience</span>
            <h2 className="font-heading text-5xl mb-6 italic">Visit our Physical Store</h2>
            <p className="text-xl text-secondary-container/90 max-w-md">Touch the materials, meet our makers, and immerse yourself in our tactile haven in Nacharam.</p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-4 mt-12">
            <button className="bg-white text-secondary px-8 py-3.5 rounded-full font-bold hover:bg-secondary-container transition-all">Get Directions</button>
            <button className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-8 py-3.5 rounded-full font-bold hover:bg-white/20 transition-all flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Book Workshop
            </button>
          </div>
        </div>

        <div className="bg-primary-container text-on-primary-container rounded-[3rem] p-12 flex flex-col justify-between relative overflow-hidden soft-extrusion min-h-[450px]">
          <div className="relative z-10">
            <span className="bg-white/10 text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-[0.2em] inline-block mb-8 border border-white/10">Subscription</span>
            <h2 className="font-heading text-5xl mb-6 italic">Monthly DIY Kits</h2>
            <p className="text-xl text-primary-fixed max-w-md leading-relaxed">A new curated craft project delivered to your door every month. Cultivate your creativity consistently.</p>
          </div>
          <div className="relative z-10 mt-12">
            <button className="bg-white text-primary px-10 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-xl">
              Subscribe Now
            </button>
          </div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/5 rounded-full blur-[80px]" />
          <Sparkles className="absolute top-10 right-10 w-32 h-32 opacity-10 rotate-12" />
        </div>
      </section>
    </main>
  );
}
