/**
 * WhatsApp deep-link helper. No "use client" / no "server-only" — usable
 * on both sides (the number is a NEXT_PUBLIC_ var, inlined at build).
 *
 * Reused by the bulk-enquiry strip (T07), the visit section, the footer
 * contact column (T09), and the cart's checkout fallback.
 */

// Digits only, with country code (e.g. "919876543210"). Empty if unset.
const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

/** True when a WhatsApp number is configured — gate CTAs on this. */
export function hasWhatsapp(): boolean {
  return NUMBER.length > 0;
}

/**
 * Build a `https://wa.me/<number>?text=<encoded>` URL with a prefilled
 * message. If no number is configured, returns wa.me with the message
 * only (the user picks a contact) — but callers should prefer gating on
 * `hasWhatsapp()` and hiding the CTA entirely.
 */
export function whatsappHref(message: string): string {
  const base = NUMBER ? `https://wa.me/${NUMBER}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
