import type { Metadata } from "next";
import { Newsreader, Manrope } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Toaster } from "@/components/ui/sonner";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Bhavani Crafts | Artisanal Supplies & Creator Studio",
  description:
    "Curated resin art, paper craft, and wood craft supplies for the modern creator. Hyderabad's artisanal craft store. Pan-India delivery.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${newsreader.variable} ${manrope.variable}`}>
      <body className="antialiased bg-background text-foreground font-sans">
        <Navbar />
        <main>{children}</main>
        <Footer />
        <CartDrawer />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
