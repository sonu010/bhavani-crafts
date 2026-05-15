# Content the AI needs from you

The AI can build everything *except* the content. This is where the rebuild blocks if you're not ready. The "real-content gate" is a hard pause before final storefront polish.

## Before the gate — nice to have, not blocking

These help the AI move faster but aren't strictly required until later phases:

- **Anthropic API key** (Phase 4) — to enable AI category/tag/description suggestions in the admin
- **Resend API key** (Phase 2) — to send admin password-reset emails

## The real-content gate (hard requirements before launch)

| # | Asset | Format | Why |
|---|---|---|---|
| 1 | **20+ real Bhavani products** entered into admin | CSV upload, or one-by-one via admin form | The catalog has to feel like Bhavani's shop, not a Just Kraft scrape |
| 2 | **8 category cover photos** | JPG/PNG, ≥1600px on the long edge, owner-shot or owner-licensed | The Atlas grid is the second thing every visitor sees |
| 3 | **Real store address** | Full street + PIN code | Powers the "Visit Bhavani Crafts" section + local-business SEO |
| 4 | **Real opening hours** | 7-day schedule, e.g. "Tue–Sun 10:00–20:00, closed Mon" | Visit section + SEO |
| 5 | **Real WhatsApp Business number** | International format `+91XXXXXXXXXX` | Bulk-enquiry CTA + every "Contact us" link |
| 6 | **Logo / wordmark decision** | SVG preferred. **Or** signed-off owner OK to use a Newsreader wordmark "Bhavani Crafts" as a temporary mark | Navbar, footer, OG images, favicon |

## How to deliver each

**Products** — easiest paths in priority order:
1. (Best) Enter via admin form after Phase 2 ships. You'll click "New Product" and fill in name, SKU, category, price, description, upload photo. The AI can help draft descriptions in Phase 4.
2. CSV upload after Phase 2 — the AI will provide a template with columns: `sku, name, category_path, price, stock, image_urls, description, tags`.
3. Send the AI an unstructured list ("I have these 20 products: …"). The AI will create the rows, mark them `needs_review`, and you click "Approve" per product.

**Category photos** — flatlay or in-store shots work best. WhatsApp them to me and I'll upload via the admin once it's live, or do it yourself.

**Address, hours, WhatsApp** — paste them in chat in any format. The AI will normalize and store them in `web/src/lib/content/store.ts` or a `store_settings` Supabase table.

**Logo** — if you have one as PNG/JPG, share it. The AI can produce a high-fidelity SVG re-trace, but pixel-perfect re-creation may need a human designer. If you don't have a logo, the AI will set up a Newsreader wordmark (just the words "Bhavani Crafts" in our display font) as the temporary mark. Looks good. You can commission a proper logo later.

## What the AI will NEVER fabricate

To keep the site honest:

- ❌ Customer testimonials, reviews, ratings
- ❌ Store photos (we use real photos or no photos)
- ❌ Founder story / About copy beyond facts you've shared
- ❌ Awards, press mentions, partner logos
- ❌ Specific product testimonials, "best-seller" claims, sales figures
- ❌ Promises about delivery timelines or shipping zones without your input

Placeholder copy is flagged `TODO(copy):` so it can't ship by accident.

## What the AI CAN draft (you review)

These are fair game for AI drafts that you approve:

- ✅ Product descriptions from name + attributes (Phase 4 feature, you accept per product)
- ✅ Alt text for product images (accessibility + SEO; auto-generated, you can edit)
- ✅ SEO meta tags (page titles, descriptions)
- ✅ "Empty state" UI copy ("No products in this category yet — check back soon")
- ✅ FAQ stubs based on common craft-supply questions (you tailor)
- ✅ Legal page stubs (Privacy / Terms / Shipping / Returns) — **but** for the final version, a one-time lawyer review is recommended before launch

## Calendar pressure

You don't owe these on a deadline. The rebuild will block at the real-content gate (around end of Phase 3, ~2–3 weeks in). If your content isn't ready, AI works on Phase 4 items that don't depend on real content (AI assistant features, image rehost script) in parallel, then resumes polish when you deliver.
