import type { Metadata, Viewport } from "next";
import { Newsreader, Manrope, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/storefront/site-url";
import "./globals.css";

/**
 * Viewport + theme-color (P3-T23 Lighthouse pass).
 *
 * Splitting `viewport` out of `metadata` follows Next 16's prescribed
 * split (the old `metadata.viewport`/`metadata.themeColor` were
 * deprecated). The themeColor tints the mobile address bar to the
 * brand's husk-100 (matches the storefront's bg) so the chrome
 * "merges" into the page on Chrome Android / Safari iOS.
 *
 * `media: "(prefers-color-scheme: light/dark)"` lets us ship two
 * tints later when we add dark mode; for now MVP is light-only and
 * one entry is enough.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // paper-0 from the design-system token table — matches the page bg
  // (#FFFCF6, the off-white cream the storefront sits on).
  themeColor: "#FFFCF6",
  colorScheme: "light",
};

/**
 * Typography (locked v2.1 — see claude/architecture/design-system.md):
 *   display = Newsreader (variable, italic) — headings + brand/editorial
 *   body    = Manrope (variable)            — UI labels + body
 *   mono    = JetBrains Mono                — SKUs, prices, technical values only
 */
const display = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/**
 * Root metadata. `metadataBase` makes relative URLs (og:image,
 * alternates.canonical) resolve against the canonical site origin.
 * Per-page `generateMetadata` overrides title/description/openGraph;
 * what's here is the home page + fallbacks.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    // The bare tagline is the home page title (no template applied to
    // a title.default). The template wraps every child page that sets
    // a string title — PDPs become "Brass Diya — Bhavani Crafts" etc.
    default: "Bhavani Crafts — craft supplies in Hyderabad",
    template: "%s — Bhavani Crafts",
  },
  description:
    "Hyderabad's craft supply studio — resin, paints, paper, wood, jewellery findings and more.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Bhavani Crafts",
    title: "Bhavani Crafts",
    description:
      "Hyderabad's craft supply studio — resin, paints, paper, wood, jewellery findings and more.",
    url: "/",
    locale: "en_IN",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
