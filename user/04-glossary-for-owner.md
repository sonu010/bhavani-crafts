# Glossary for the owner

The AI uses some technical terms. Here's what they mean in plain English.

## Catalog

- **Product** — one thing for sale (e.g. "Acrylic Paint Set, 12 colors").
- **SKU** — a short unique code for each product (e.g. `RES-VLT-100ML`). Like a barcode but typeable.
- **Slug** — the URL-friendly version of a name (e.g. `acrylic-paint-set-12-colors` → `/p/acrylic-paint-set-12-colors`).
- **Variant** — different versions of the same product (size, color). Each variant has its own SKU and price.
- **Attribute** — a property used for filtering (e.g. volume in ml, paper GSM). Different from a tag because it's structured.
- **Tag** — a free-form keyword for cross-cutting groups ("monsoon collection", "best for kids"). Not for filters.
- **Category** — a section of the shop. Has a parent (e.g. Resin Art Supplies → Resin Moulds).

## Workflow

- **Published** vs **unpublished** — whether a product is visible to customers on the storefront. Unpublished products only show up in the admin.
- **Review status** — the admin workflow state of a product: `draft` (being built), `needs_review` (just imported), `ready_to_publish` (vetted), `published` (live), `archived` (taken down).
- **Soft delete** — "deleted" but recoverable. Hidden from everyone, but click "Restore" in the Trash and it comes back. Real deletion (hard delete) requires typed confirmation.
- **Bulk action** — doing something to many products at once (e.g. publish 50 at a time).

## The site

- **Storefront** — what your customers see (the public site).
- **Admin** — what you see (the dashboard for managing products). Behind a login.
- **Cart** — saved locally in the customer's browser. No accounts in MVP.
- **Checkout** — not yet built. Out of MVP. Comes later.

## Behind the scenes

- **Supabase** — our backend. Holds the products database, your admin login, and image storage. One service, free tier.
- **Vercel** — where the website is hosted. Pushing to GitHub triggers a deploy.
- **Postgres** — the database type Supabase uses. Solid, mature, handles 100k+ products easily.
- **Migration** — a script that changes the database shape (e.g. "add a column for X"). Tracked in git so changes are reproducible.
- **RLS** (Row Level Security) — Postgres rules that decide who can see/edit each row. We use it to make sure anonymous visitors can only read published products and can't write anything.
- **ISR** (Incremental Static Regeneration) — Next.js feature that makes the storefront fast by caching pages, refreshing them every 60 seconds AND immediately when you edit something in the admin.
- **Cache invalidation** — when the admin saves a change, the storefront's cache for the affected pages is cleared, so the change appears within ~5 seconds.

## AI features

- **Assistive** vs **autonomous** — AI suggests; you accept. Nothing AI-generated reaches the storefront without you clicking "Accept."
- **Prompt injection** — an attack where someone tries to trick the AI by sneaking instructions into product descriptions. We defend against this; you don't need to worry about it.
- **`ai_generations`** — the audit table where every AI suggestion is logged (model used, cost, your accept/reject decision).

## Money

- **AI monthly cap** — `$20/month` by default. AI features stop working at 90% of the cap. Raise the cap by changing an env var.
- **Vercel free tier** — covers our scale comfortably. We'll only hit the paid tier if traffic gets significant.
- **Supabase free tier** — 500 MB database + 1 GB storage. Catalogs of ~10k products with our image sizes fit comfortably.

## Process

- **Phase** — one of 6 stages of the rebuild (0: setup, 1: data, 2: admin, 3: storefront, 4: AI + polish, 5: launch).
- **Task** — a single unit of work, file by file. Each has its own page in `claude/tasks/`.
- **Real-content gate** — a hard pause before final polish until you've delivered real products, photos, address, etc. (see `05-content-the-AI-needs-from-you.md`).
- **Launch blocker** — a SQL check that, if it returns any rows, blocks the deploy. We use these to make sure no Just Kraft seed data leaks to the public.

## When you're unsure

Ask. There's no dumb question — every question caught now is one we don't have to debug later.
