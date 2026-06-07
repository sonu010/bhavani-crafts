/**
 * WhatsApp deep-link helpers — pure, no I/O.
 *
 * Originally read NEXT_PUBLIC_WHATSAPP_NUMBER directly so both client
 * and server callers could use them. Once /admin/settings shipped,
 * the number is owner-editable + lives in `app_settings`. Helpers
 * now take the number as an argument; server callers resolve it via
 * `getStorefrontSettings()` and pass it in. Either side calling with
 * an empty/null number gets a graceful no-op (hasWhatsapp = false).
 *
 * Reused by the bulk-enquiry strip (T07), the visit section, the
 * footer contact column (T09), and the cart's checkout fallback.
 */

/** True when a WhatsApp number is configured — gate CTAs on this. */
export function hasWhatsapp(number: string | null | undefined): boolean {
  return typeof number === "string" && number.replace(/\D/g, "").length > 0;
}

/**
 * Build a `https://wa.me/<number>?text=<encoded>` URL with a
 * prefilled message. Callers should gate on `hasWhatsapp(number)`
 * and hide the CTA entirely when there's no number — passing empty
 * here yields `https://wa.me/` which has no destination targeting.
 */
export function whatsappHref(
  number: string | null | undefined,
  message: string,
): string {
  const digits = (number ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
