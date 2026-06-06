"use client";

import { toast } from "sonner";

/**
 * Click-to-copy address line for the visit section (T08). On click,
 * copies the address to the clipboard and shows a "Copied" toast. Falls
 * back to selecting the text if the clipboard API is unavailable.
 */
export function CopyAddress({ address }: { address: string }) {
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        toast.success("Address copied");
        return;
      }
    } catch {
      // fall through to selection
    }
    // Fallback: select the button's text so the user can copy manually.
    const range = document.createRange();
    range.selectNodeContents(e.currentTarget);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    toast.message("Press ⌘/Ctrl+C to copy the address");
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-left font-[family-name:var(--font-display)] text-lg leading-relaxed text-bark-900 underline decoration-husk-200 decoration-1 underline-offset-4 transition-colors hover:decoration-bark-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
      title="Click to copy"
    >
      {address}
    </button>
  );
}
