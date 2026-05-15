"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Package, ShoppingBag, Megaphone, Image as ImageIcon,
  Settings, TrendingUp, Users, BarChart3, ChevronRight, Plus, Edit2,
  Trash2, Eye, CheckCircle2, Clock, XCircle, ArrowUpRight, Menu, X, Filter, Search
} from "lucide-react";
import { CATEGORIES, Product } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { createProductAction, removeProductAction } from "@/lib/actions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// ─── Mock data for things not in DB yet ───────────────────────────────────────
const MOCK_ORDERS = [
  { id: "ORD-1021", customer: "Priya Mehta", items: 3, total: 1249, status: "dispatched", date: "2 May 2026" },
  { id: "ORD-1020", customer: "Rohit Kumar", items: 1, total: 349, status: "pending", date: "2 May 2026" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600 bg-amber-50" },
  dispatched: { label: "Dispatched", icon: ArrowUpRight, color: "text-blue-600 bg-blue-50" },
  delivered: { label: "Delivered", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600 bg-red-50" },
};

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "products", label: "Inventory", icon: Package },
  { id: "settings", label: "Store Settings", icon: Settings },
];

export default function AdminPage() {
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Fetch real products
  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      });
  }, [tab]); // Refresh when switching tabs

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to remove this material from the Atelier?")) {
      await removeProductAction(id);
      setProducts(products.filter(p => p.id !== id));
      toast.success("Material removed successfully");
    }
  };

  const Sidebar = (
    <div className="w-64 bg-[#1b1c19] text-[#fbf9f4] flex flex-col h-full">
      <div className="p-8 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white font-bold text-sm">BC</span>
          </div>
          <div>
            <p className="font-heading italic text-lg leading-tight">Bhavani Crafts</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary leading-tight">Admin Console</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all",
              tab === id
                ? "bg-primary text-white shadow-xl"
                : "text-white/40 hover:text-white hover:bg-white/5"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-white/5">
        <Link
          href="/"
          className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-primary transition"
        >
          <Eye className="w-3.5 h-3.5" />
          View Live Atelier
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#fbf9f4] font-sans antialiased overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block flex-shrink-0">{Sidebar}</div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 border-b border-outline-variant/30 bg-white/80 backdrop-blur-md flex items-center px-8 gap-4 flex-shrink-0 z-30">
          <button className="md:hidden p-2 rounded-xl hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-primary" />
          </button>
          <h1 className="font-heading text-3xl italic text-on-surface capitalize">{tab}</h1>
          
          <div className="ml-auto flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-secondary/10 rounded-full border border-secondary/20">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Store Live</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary soft-extrusion font-bold text-sm">
              VT
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {tab === "dashboard" && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Active Orders", value: "24", delta: "+4", icon: ShoppingBag, color: "bg-primary/10 text-primary" },
                  { label: "Atelier Revenue", value: "₹42,890", delta: "+12%", icon: TrendingUp, color: "bg-secondary/10 text-secondary" },
                  { label: "Total Supplies", value: String(products.length), delta: "Scale Ready", icon: Package, color: "bg-orange-50 text-orange-600" },
                  { label: "New Creators", value: "156", delta: "+8", icon: Users, color: "bg-blue-50 text-blue-600" },
                ].map((s) => (
                  <div key={s.label} className="bg-white p-6 rounded-[2rem] soft-extrusion border border-outline-variant/10">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-2xl ${s.color} flex items-center justify-center shadow-inner`}>
                        <s.icon className="w-6 h-6" />
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-widest">{s.delta}</Badge>
                    </div>
                    <p className="font-heading text-3xl italic text-on-surface">{s.value}</p>
                    <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              
              <div className="bg-white rounded-[2.5rem] soft-extrusion border border-outline-variant/10 overflow-hidden">
                <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center">
                  <h2 className="font-heading text-2xl italic text-on-surface">Recent Atelier Activity</h2>
                  <Button variant="ghost" className="text-[10px] font-bold uppercase tracking-widest">View Ledger</Button>
                </div>
                <div className="divide-y divide-outline-variant/10">
                  {MOCK_ORDERS.map((order) => {
                    const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                    return (
                      <div key={order.id} className="p-6 flex items-center justify-between hover:bg-surface-container/30 transition-colors">
                        <div className="flex gap-4 items-center">
                          <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary font-bold text-xs">
                            {order.id.split('-')[1]}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-on-surface">{order.customer}</p>
                            <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest">{order.date} · {order.items} Items</p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-6">
                          <div>
                            <p className="font-heading text-lg italic text-primary">₹{order.total}</p>
                          </div>
                          <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest", status.color)}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === "products" && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <h2 className="font-heading text-4xl italic text-on-surface">Inventory Studio</h2>
                  <p className="text-sm text-on-surface-variant mt-2">{products.length} Materials currently in the collection</p>
                </div>
                
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                  <DialogTrigger asChild>
                    <Button className="h-14 px-8 rounded-2xl bg-primary text-on-primary font-bold shadow-lg hover:shadow-xl transition-all gap-2">
                      <Plus className="w-5 h-5" /> Add New Material
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl bg-background rounded-[3rem] p-10 border-outline-variant/20 shadow-2xl">
                    <DialogHeader className="mb-8">
                      <DialogTitle className="font-heading text-4xl italic text-primary">New Supply Addition</DialogTitle>
                    </DialogHeader>
                    <form action={async (fd) => {
                      await createProductAction(fd);
                      setIsAddModalOpen(false);
                      toast.success("New material added to the Atelier catalog");
                      // Re-fetch handled by tab state or layout trigger
                    }} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Material Name</label>
                        <input name="name" required className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="e.g. Copper Foil Flakes" />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Category</label>
                          <select name="category" className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none appearance-none">
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Price (₹)</label>
                          <input name="price" type="number" required className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="249" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Description</label>
                        <textarea name="description" required className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none h-24" placeholder="Brief story about this material..." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Image URL (Unsplash)</label>
                        <input name="image" className="w-full bg-surface-container border-none rounded-xl py-4 px-6 soft-extrusion focus:ring-2 focus:ring-primary/20 outline-none" placeholder="Leave blank for default" />
                      </div>
                      <div className="flex items-center gap-3 bg-surface-container p-4 rounded-xl">
                        <input type="checkbox" name="inStock" value="true" defaultChecked className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-on-surface">Instantly Available in Stock</span>
                      </div>
                      <div className="flex gap-4 pt-4">
                        <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} className="flex-1 h-14 rounded-2xl font-bold uppercase tracking-widest">Cancel</Button>
                        <Button type="submit" className="flex-1 h-14 bg-primary text-on-primary rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all">Add to Collection</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="bg-white rounded-[2.5rem] soft-extrusion border border-outline-variant/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-surface-container/50 border-b border-outline-variant/10">
                        <th className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 p-6">Material</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 p-6">Collection</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 p-6">Price</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 p-6">Status</th>
                        <th className="text-right text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 p-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-surface-container/20 transition-colors group">
                          <td className="p-6">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-surface-container soft-extrusion">
                                <img src={p.image} className="w-full h-full object-cover" />
                              </div>
                              <div className="max-w-[240px]">
                                <p className="font-bold text-sm text-on-surface line-clamp-1">{p.name}</p>
                                <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest mt-1">ID: ...{p.id.slice(-8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            <Badge variant="outline" className="bg-secondary/5 text-secondary border-secondary/20 text-[9px] uppercase tracking-widest">{p.category}</Badge>
                          </td>
                          <td className="p-6">
                            <p className="font-heading text-lg italic text-primary">₹{p.price}</p>
                          </td>
                          <td className="p-6">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", p.inStock ? "bg-emerald-500" : "bg-red-500")} />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                                {p.inStock ? "In Stock" : "Unavailable"}
                              </span>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-all">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(p.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-on-surface-variant hover:text-red-500 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {loading && <div className="p-20 text-center text-on-surface-variant italic">Refining the catalog...</div>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
