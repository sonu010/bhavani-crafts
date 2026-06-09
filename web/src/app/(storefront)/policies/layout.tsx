/**
 * /policies/* shared chrome.
 *
 * Renders the storefront layout (header/footer/skip-link inherited from
 * the parent `(storefront)` layout). Adds a constrained `prose`
 * container so policy text reads at a comfortable measure on any
 * width, plus a back-link to the home page for orientation.
 *
 * Each policy page sets its own `metadata.title` so the root title
 * template wraps as "Privacy — Bhavani Crafts" etc. Pages are
 * indexable (no `noindex` override here); legal content needs to be
 * crawlable for Razorpay's due-diligence flow.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-bark-900"
      >
        <ChevronLeft className="size-3.5" />
        Back to Bhavani Crafts
      </Link>
      <article className="mt-6 [&_h1]:font-[family-name:var(--font-display)] [&_h1]:text-3xl [&_h1]:tracking-tight [&_h1]:text-bark-900 [&_h1]:sm:text-4xl [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-bark-900 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-bark-900 [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-stone-700 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:leading-relaxed [&_ul]:text-stone-700 [&_li]:mt-1.5 [&_a]:text-teal-800 [&_a]:underline-offset-2 [&_a:hover]:underline">
        {children}
      </article>
    </main>
  );
}
