---
id: P3-T09
phase: 3
title: Public footer
status: done
depends_on: [P3-T01]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

The editorial 4-column footer: brand + tagline · Catalog links ·
Policies · Contact (WhatsApp + Instagram). Newsletter = one input +
button.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #8
- P3-T01 — `(storefront)` layout (footer slot)

# Files to touch

- `web/src/components/storefront/site-footer.tsx` (new).
- `web/src/app/(storefront)/layout.tsx` (modified) — render footer
  below `{children}` on every storefront page.
- `web/src/app/(storefront)/_footer/newsletter-form.tsx` (new) —
  client; the email capture.

# Implementation notes

- **4 columns** collapse to a single stack on mobile.
  - Brand + tagline (Newsreader brand, one-line tagline)
  - Catalog: links to top categories (`listTopLevelCategories`, first
    ~6) + `/search`
  - Policies: static links (Shipping, Returns, Privacy) — stub the
    routes; full policy pages can land later
  - Contact: WhatsApp (reuse `whatsappHref` from T07), Instagram,
    address line
- **Newsletter MVP:** capture email into a `newsletter_signups` table
  if it exists; if not, this is a no-op stub that shows a "thanks"
  toast and logs intent. Do NOT build an email provider integration —
  flag for a later task. Validate email format client-side.
- Footer renders inside the storefront layout so every public page
  gets it; admin pages never do.

# Acceptance criteria

- [ ] 4-column footer (brand / catalog / policies / contact) collapses
      to a stack on mobile.
- [ ] Catalog links resolve to real top categories.
- [ ] Newsletter input validates email + shows a confirmation toast
      (persistence is a stub if no table exists).
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# Any storefront page → footer renders; submit newsletter → toast
```

# Dependencies added

(none)

# Notes for next agent

  - `components/storefront/site-footer.tsx` (4-col, mounted in the
    storefront layout below children) + `_footer/newsletter-form.tsx`
    (client, client-side email validation, NO-OP toast — no
    `newsletter_signups` table / provider yet; flagged for later).
    Catalog column reuses the layout's nav categories (first 6).
    Policy routes stubbed. Instagram gated on `NEXT_PUBLIC_INSTAGRAM_URL`.
