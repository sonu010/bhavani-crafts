# ADR-005 — Newsreader + Manrope + JetBrains Mono

**Status:** Accepted · **Date:** 2026-05-15

## Context

Default Next.js scaffolds use Inter at every weight. The site needs to read as a 2026 boutique craft retailer, not a generic SaaS template. Typography choice is a major component of "made by a senior" vs "AI-generated."

## Decision

- **Newsreader (variable, with italic)** for display + headings + brand/editorial use.
- **Manrope (variable)** for body, UI labels, navigation.
- **JetBrains Mono** for numerics, prices, SKUs, technical metadata only.

## Consequences

**Positive:**
- Three voices with distinct roles. The serif/sans pairing reads as editorial; the monospace gives prices and SKUs a deliberate technical feel.
- All three are free Google Fonts, self-hosted via `next/font`. No FOIT/FOUT, no Adobe Fonts licensing.
- Newsreader has a real italic and an optical-size axis — useful for the hero treatment.
- Manrope is geometric without being sterile.

**Negative:**
- Three font families means three font-face declarations and three subsets. We mitigate by self-hosting only Latin + Latin-extended subsets.
- The owner's brand mark may not pair naturally with Newsreader; if a custom wordmark is commissioned later, this decision may need to flex (the wordmark could be its own face).

## Usage rules

- JetBrains Mono is for **numeric or technical** values: product prices, SKUs, stock counts, timestamps, import-row numbers, audit-log IDs.
- JetBrains Mono is **never** for marketing copy, buttons, navigation, body, FAQ, onboarding, or any place a customer reads sentences.
- Newsreader italic is for **single-word or short-phrase emphases**, not long paragraphs.

## Revisit trigger

If the owner commissions a custom wordmark / logotype that doesn't pair with Newsreader, this ADR is updated.
