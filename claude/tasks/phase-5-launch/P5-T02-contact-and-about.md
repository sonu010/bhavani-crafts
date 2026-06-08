---
id: P5-T02
phase: 5
title: Contact + About pages
status: not_started
depends_on: [P5-T00]
estimate_hours: 2
owner: shared
last_updated: 2026-06-07
---

# Goal

Two human-facing pages most storefronts ship and ours doesn't yet:

- `/about` — the brand story. "Who is Bhavani Crafts, who's behind
  it, why does it exist."
- `/contact` — the canonical "how to reach us" page. WhatsApp +
  email + the Hyderabad studio address + map link. Replaces the
  Visit-section's address blob as the deep-link target.

Both are linked from the footer and the storefront layout.

# Prerequisites (read first)

- `web/src/app/(storefront)/_landing/visit.tsx` — current address +
  hours surfaces inline on the landing page; the Contact page is
  the deep-link version of that
- `web/src/components/storefront/site-footer.tsx` — link both URLs
  from the appropriate footer columns
- `web/src/lib/storefront/settings.ts` — `whatsappNumber` + future
  email come from `app_settings`; surface via getStorefrontSettings

# Files to touch

- `web/src/app/(storefront)/about/page.tsx` (new) — owner story,
  Hyderabad context, craft-supplier positioning
- `web/src/app/(storefront)/contact/page.tsx` (new) — WhatsApp +
  email + address + hours + embedded map (or static-image fallback)
- `web/src/components/storefront/site-footer.tsx` (modified) — add
  "About" to the brand column, "Contact" to the contact column
- `web/e2e/anon/about-contact.spec.ts` (new) — both URLs 200, both
  show whatsapp + address (when settings configured), no crawler block

# Implementation notes

- **Content (About):** 2-3 paragraphs of owner-supplied story. Tone
  set by the existing landing copy ("editorial pull-quotes,
  Newsreader display font"). Include the studio photo placeholder
  the Visit section uses — same `<Image>` until a real photo lands.
- **Content (Contact):** WhatsApp click-to-chat (use the same
  `whatsappHref(number, …)` helper the bulk-enquiry CTA uses), an
  email link (new `app_settings.contact_email` key — add to
  KNOWN_SETTINGS_KEYS + the Settings page form), the street address
  the Visit section already renders, business hours.
- **No CMS:** straight TSX, prose-styled like the policy pages.
- **No client JS** beyond the existing `<CopyAddress>` button reused
  from the Visit section.
- **Map:** OpenStreetMap iframe OR a static map image hot-linked
  from `https://staticmap.openstreetmap.de/` (no API key, free).
  Avoid Google Maps embed (API key + billing).
- **SEO:** `metadata.title` = "About" / "Contact" (template wraps).
  `alternates: { canonical: "/about" }` etc. Both indexable.

# Acceptance criteria

- [ ] `/about` + `/contact` return 200 with rendered content.
- [ ] Title template wraps ("About — Bhavani Crafts").
- [ ] Contact page has a WhatsApp click-to-chat link (gated on the
      number being configured in /admin/settings; hide otherwise).
- [ ] Contact page shows the Hyderabad address + hours.
- [ ] Footer's brand column links to About; contact column links
      to Contact.
- [ ] Both URLs in sitemap.xml.
- [ ] `e2e/anon/about-contact.spec.ts` passes.

# Verification

```bash
cd web && pnpm build && pnpm start
curl -s -o /dev/null -w "%{http_code} /about\n" http://localhost:3000/about
curl -s -o /dev/null -w "%{http_code} /contact\n" http://localhost:3000/contact
pnpm playwright test e2e/anon/about-contact.spec.ts
```

# Notes for next agent

(empty)
