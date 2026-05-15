"use client";

import { useState } from "react";
import { Heart, MessageCircle, Share2, Bookmark, ShoppingBag, Plus, Users, Play, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";

const FEED_ITEMS = [
  {
    id: 1,
    artisan: "Elena Rostova",
    role: "Master Potter • Kyoto",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80",
    title: "Hand-Thrown Terracotta Vase",
    description: "Watching the clay rise on the wheel never gets old. For this piece, I'm using a heavily grogged terracotta from a local seam to give it that brutalist, tactile finish.",
    image: "https://images.unsplash.com/photo-1556761175-4b46a572b786?w=1200&q=80",
    likes: "12K",
    comments: "342",
    tags: ["Pottery", "Wheel Thrown", "Intermediate"],
    makers: 50
  },
  {
    id: 2,
    artisan: "Julian Vance",
    role: "Woodworker • Oslo",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80",
    title: "Birchwood Serving Spoon",
    description: "Slowly carving away the excess to reveal the grain beneath. Using traditional hand tools to shape this spoon out of sustainable birch. It's a slow, meditative process.",
    image: "https://images.unsplash.com/photo-1610906269359-54316b016c43?w=1200&q=80",
    likes: "8.4K",
    comments: "156",
    tags: ["Woodworking", "Hand Carved", "Beginner"],
    makers: 24
  }
];

export default function FeedPage() {
  const [activeTab, setActiveCategory] = useState("for-you");

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-sans antialiased overflow-hidden h-screen">
      {/* Top Bar with Toggle */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-12 py-5 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 md:flex hidden">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-heading text-2xl italic font-bold text-primary">Bhavani Crafts</Link>
          <div className="flex items-center bg-surface-container rounded-full p-1 soft-extrusion">
            <button 
              onClick={() => setActiveCategory("for-you")}
              className={cn(
                "px-8 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === "for-you" ? "bg-primary text-on-primary shadow-lg" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              For You
            </button>
            <button 
              onClick={() => setActiveCategory("following")}
              className={cn(
                "px-8 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === "following" ? "bg-primary text-on-primary shadow-lg" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Following
            </button>
          </div>
        </div>
        <button className="bg-primary text-on-primary px-8 py-3 rounded-full font-bold text-sm shadow-lg hover:shadow-xl transition-all">
          Suggest a project
        </button>
      </header>

      {/* Main Feed */}
      <main className="flex-1 mt-0 md:mt-24 h-screen md:h-[calc(100vh-96px)] overflow-y-auto snap-y snap-mandatory hide-scrollbar">
        {FEED_ITEMS.map((item) => (
          <div key={item.id} className="w-full h-full flex flex-col md:flex-row snap-start relative bg-surface">
            {/* Visual Side */}
            <div className="w-full md:w-3/5 h-[60vh] md:h-full relative overflow-hidden bg-black group">
              <img 
                src={item.image} 
                className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105"
                alt={item.title}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <Play className="w-8 h-8 fill-current" />
                </div>
              </div>

              {/* Mobile Overlay Actions */}
              <div className="absolute right-4 bottom-12 flex flex-col gap-6 md:hidden">
                <button className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-lg flex items-center justify-center text-white">
                    <Heart className="w-6 h-6" />
                  </div>
                  <span className="text-white text-[10px] font-bold">{item.likes}</span>
                </button>
                <button className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-lg flex items-center justify-center text-white">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <span className="text-white text-[10px] font-bold">{item.comments}</span>
                </button>
                <button className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-lg flex items-center justify-center text-white">
                  <Share2 className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Info Side */}
            <div className="w-full md:w-2/5 flex flex-col p-8 md:p-16 justify-between bg-surface-container relative z-10 shadow-2xl">
              <div className="space-y-8 overflow-y-auto pr-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/20 soft-extrusion">
                      <img src={item.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="font-heading text-xl italic font-bold text-on-surface">{item.artisan}</h3>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{item.role}</p>
                    </div>
                  </div>
                  <button className="px-6 py-2 rounded-full border-2 border-primary text-primary font-bold text-xs hover:bg-primary hover:text-white transition-all">
                    Follow
                  </button>
                </div>

                <div className="space-y-6">
                  <h2 className="font-heading text-4xl md:text-5xl italic text-on-surface leading-tight">{item.title}</h2>
                  <p className="text-lg text-on-surface-variant leading-relaxed">
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map(tag => (
                      <span key={tag} className="px-4 py-1.5 bg-surface rounded-full text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border border-outline-variant/30">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-white/50 p-6 rounded-3xl soft-extrusion border border-outline-variant/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                      <Users className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-on-surface">
                      <strong className="font-bold text-primary">{item.makers} people</strong> are making this right now
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-12 space-y-8">
                <div className="hidden md:flex items-center justify-between border-t border-outline-variant/20 pt-8">
                  <div className="flex items-center gap-8 text-on-surface-variant">
                    <button className="flex items-center gap-2 hover:text-primary transition-colors group">
                      <Heart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-sm">{item.likes}</span>
                    </button>
                    <button className="flex items-center gap-2 hover:text-secondary transition-colors group">
                      <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-sm">{item.comments}</span>
                    </button>
                    <button className="hover:text-on-surface transition-colors">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                  <button className="text-on-surface-variant hover:text-primary transition-colors">
                    <Bookmark className="w-5 h-5" />
                  </button>
                </div>

                <button className="w-full py-5 bg-primary text-on-primary rounded-[2rem] font-bold text-lg shadow-xl shadow-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-4 group/btn">
                  <ShoppingBag className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />
                  Make This (Get Bundle)
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
