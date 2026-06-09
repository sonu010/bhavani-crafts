---
id: P5-T02
phase: 5
title: Contact + About pages
status: done
depends_on: [P5-T00]
estimate_hours: 2
owner: shared
last_updated: 2026-06-09
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

- [x] `/about` + `/contact` return 200 with rendered content (both
      prerender as `○` static).
- [x] Title template wraps ("About — Bhavani Crafts" / "Contact —
      Bhavani Crafts").
- [x] Contact page has a WhatsApp click-to-chat link (gated on the
      number being configured in /admin/settings; hide otherwise).
- [x] Contact page shows the Hyderabad address + hours.
- [x] Footer's brand column links to About; contact column links
      to Contact.
- [x] Both URLs in sitemap.xml.
- [x] `e2e/anon/about-contact.spec.ts` exists (5 tests covering
      render + canonical + sitemap inclusion + footer wiring +
      back-link).

# Verification

```bash
cd web && pnpm build && pnpm start
curl -s -o /dev/null -w "%{http_code} /about\n" http://localhost:3000/about
curl -s -o /dev/null -w "%{http_code} /contact\n" http://localhost:3000/contact
pnpm playwright test e2e/anon/about-contact.spec.ts
```

# Notes for next agent

- About + Contact ship as standalone TSX (no shared `policies/`
  layout — different visual treatment, photo block on /about,
  contact dl on /contact). Both pages have a `<Link href="/">`
  back-link in the same style the policy pages use.
- **Email is hardcoded** (`hello@bhavanicrafts.example`) as a
  DRAFT placeholder. Owner replaces in `contact/page.tsx`. A
  follow-up to promote it to `app_settings.contact_email` would
  require:
  - A new migration adding `contact_email` to the public-allowlist
    of `app_settings_public_select`.
  - Extending `KNOWN_SETTINGS_KEYS` + the Settings page form +
    `getStorefrontSettings()` to include it.
  - Updating the email validator in
    `app-settings-validators.ts`.
- **Address + hours are hardcoded** mirroring the landing-page
  Visit section (`_landing/visit.tsx`). When the owner provides
  real values, edit both files in one commit (search for "Plot 00,
  Road 00" to find them).
- **Photo placeholder** on /about uses the same husk-100
  placeholder block as the Visit section. Swap for a real
  `next/image` import when owner provides a photo.
- WhatsApp + Instagram links pull from `app_settings` via
  `getStorefrontSettings()` — owner edits them in /admin/settings
  and the storefront-settings cache flushes on save.
- Sitemap STATIC_ROUTES now includes both URLs, priority 0.4,
  monthly change frequency.
- Footer additions: "Our story →" link in the brand column;
  "Contact us" at the top of the contact column.
- The bulk-enquiry CTA on the home page already links to
  `whatsappHref(…)` — the contact page is the deep-link fallback
  for when WhatsApp isn't configured or the user prefers email.
