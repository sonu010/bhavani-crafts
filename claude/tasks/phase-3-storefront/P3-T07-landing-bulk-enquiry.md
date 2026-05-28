---
id: P3-T07
phase: 3
title: Landing — bulk enquiry strip
status: not_started
depends_on: [P3-T01]
estimate_hours: 1
owner: ai
last_updated: 2026-05-18
---

# Goal

A full-bleed paper-0 strip with an oversized Newsreader pull-quote
("Doing a class of 40? We deliver to your school.") and one CTA that
opens WhatsApp with a prefilled message.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #6
- P3-T01 — layout + button styles

# Files to touch

- `web/src/app/(storefront)/_landing/bulk-enquiry.tsx` (new).
- `web/src/app/(storefront)/page.tsx` (modified) — mount.
- `web/src/lib/storefront/whatsapp.ts` (new) — `whatsappHref(message)`
  helper building the `https://wa.me/<number>?text=<encoded>` URL.

# Implementation notes

- **WhatsApp number** comes from an env var
  (`NEXT_PUBLIC_WHATSAPP_NUMBER`); add to `.env.example`. The helper
  URL-encodes a prefilled message. Reused by the cart's checkout
  fallback + the visit section.
- Full-bleed: break out of the page container (`w-screen` + centering
  trick or a full-bleed utility). paper-0 background.
- Pull-quote: Newsreader, large, one italic emphasis. Single primary
  CTA (teal-800 pill) → `whatsappHref(...)`, opens in new tab
  (`rel="noopener"`).

# Acceptance criteria

- [ ] Full-bleed paper-0 strip with Newsreader pull-quote + WhatsApp
      CTA.
- [ ] CTA opens wa.me with a prefilled, URL-encoded message.
- [ ] `NEXT_PUBLIC_WHATSAPP_NUMBER` documented in .env.example.
- [ ] No page horizontal overflow at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# / → bulk strip; click CTA → wa.me opens with prefilled text
```

# Dependencies added

(none)

# Notes for next agent

(empty)
