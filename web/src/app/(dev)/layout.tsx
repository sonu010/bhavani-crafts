import { notFound } from "next/navigation";

/**
 * The (dev) route group is only visible in development.
 * Production builds 404 these routes. See /design page below.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
