# Runbook: launch day

**Owner walks this top to bottom before flipping DNS.** Every box ticked
= go for launch. Anything unticked = no launch — fix it.

Living document. Update each time we cut over (the first one is the
hardest; later ones should mostly re-use the same checks).

Last revised: 2026-06-10 (P5-T09)

---

## Section 0 — Cutover prerequisites (do once, before everything else)

**The single biggest gotcha:** GitHub Actions schedules only fire from
the **default branch**. `main` is still the old prototype tree; every
workflow we built (`backup.yml`, `rls-attack.yml`,
`broken-image-sweep.yml`, `ci.yml`) lives on `rebuild-v2`. Until cutover,
nothing runs nightly.

- [ ] **Merge** `rebuild-v2` → `main` **OR** flip the GitHub default
      branch to `rebuild-v2`. Recommended: flip the default to
      `rebuild-v2` for the initial launch, then merge later.
      Settings → General → Default branch → `rebuild-v2`.
- [ ] Within 24h after cutover: visit Actions tab → confirm the next
      scheduled `backup.yml` run completed (will trigger at 02:00 UTC).
- [ ] Within 7 days: confirm at least one nightly `backup.yml` and one
      `broken-image-sweep.yml` ran without manual touch.

---

## Section 1 — Functional smoke (anon)

Run these against the live preview URL before DNS flip.

- [ ] **Anon journey**:
      ```
      Load /
      Click an Atlas tile → /c/<slug>
      Apply a filter (price under ₹500)
      Open a product → /p/<slug>
      Add to cart → drawer opens
      Click "Checkout" → /checkout
      Fill the form
      Submit → /checkout/pending with the order number
      ```
- [ ] **Search**:
      ```
      Click the header search icon
      Type "diya" → see results
      Type "xyz123nonsense" → see the empty-state message
      ```
- [ ] **Cart persists** across reload (zustand persist middleware).
- [ ] **WhatsApp CTA on /checkout/pending** opens
      `https://wa.me/<number>?text=<encoded>` with the order number
      pre-filled.

## Section 2 — Functional smoke (admin)

- [ ] **Login**: `/login` → email + password → TOTP prompt → land on
      `/admin`. Use the recovery code if your authenticator app is
      missing.
- [ ] **Create a product**:
      ```
      /admin/products → "New product"
      Fill SKU + slug + name + category
      Save → /admin/products/<id>/edit
      Upload an image (drag-drop, must be ≤ 5 MB, not WebP)
      Hit Publish on the Publish tab
      ```
- [ ] Wait the cache window (≤ 60s); the product appears at
      `/p/<slug>`.
- [ ] **Order lifecycle**:
      ```
      Create a pending_payment order via the anon flow above
      /admin/orders → see it in the list
      Click → /admin/orders/<id>
      "Mark paid" → status flips, stock decrements, audit row written
      ```
- [ ] **Settings**:
      ```
      /admin/settings
      Change "Shop name" → save
      Storefront footer reflects within ~10 minutes
      ```
- [ ] **CSV import** (smoke):
      ```
      /admin/imports → upload data/justkraft-inventory/sample.csv
      Validate → see preview
      Execute → background job runs
      Report shows counts matching upload
      ```
- [ ] **Trash + restore**:
      ```
      Soft-delete a product from /admin/products
      /admin/trash → see it
      Restore → it's back in /admin/products
      ```

## Section 3 — Pages exist + content

- [ ] `/` 200, hero + Atlas grid + weekly + kits + bulk + visit all render
- [ ] `/policies/privacy` 200, owner-approved content (NOT the DRAFT placeholder)
- [ ] `/policies/terms` 200, owner-approved content
- [ ] `/policies/shipping` 200, flat-rate ₹ shows the live setting
- [ ] `/policies/returns` 200, owner-approved content
- [ ] `/about` 200, owner-approved story + real studio photo (not placeholder)
- [ ] `/contact` 200, real email + WhatsApp + address + hours
- [ ] `/search` empty-state has useful messaging
- [ ] `/this-doesnt-exist` returns 404 with the storefront chrome

## Section 4 — SEO + share previews

- [ ] `/sitemap.xml` lists `/`, `/search`, the four `/policies/*`,
      `/about`, `/contact`, every published `/p/<slug>`, every
      non-deleted `/c/<slug>`. Sanity check:
      ```bash
      curl -s https://<live>/sitemap.xml | grep -c '<url>'
      ```
- [ ] `/robots.txt` allows `/`, disallows `/admin`, `/auth`, `/api`,
      `/design`. Points at `/sitemap.xml`.
- [ ] **OG cards render** (P5-T04). Test on each:
      - https://www.opengraph.xyz/url/https%3A%2F%2F<live>
      - https://www.opengraph.xyz/url/https%3A%2F%2F<live>%2Fc%2F<slug>
      - https://www.opengraph.xyz/url/https%3A%2F%2F<live>%2Fp%2F<slug>

      Each preview should show a 1200×630 branded card.
- [ ] **PDP JSON-LD validates** against the
      [Google Rich Results test](https://search.google.com/test/rich-results).
- [ ] Title template wraps every page: `Bhavani Crafts —…` on `/`,
      `<X> — Bhavani Crafts` elsewhere.

## Section 5 — Performance + accessibility

- [ ] **Lighthouse mobile** on `/`, `/c/<slug>`, `/p/<slug>` (incognito):
      - Performance ≥ 80
      - Accessibility ≥ 95
      - Best Practices ≥ 95
      - SEO ≥ 95
- [ ] **No horizontal scroll at 360 px** on home, category, PDP, cart,
      checkout, contact, about, policies.
- [ ] **Skip-link works**: tab on `/`, "Skip to content" link appears
      and focuses `<main>`.
- [ ] **Blur-up on images**: load a PDP cold; images should fade in
      from a small blur (P4-T12 backfill landed).

## Section 6 — Security

- [ ] **RLS attack probe** clean against LIVE:
      ```bash
      cd web
      pnpm rls-attack --live
      ```
      Expect 40/40 PASS.
- [ ] **Launch blockers** clean against LIVE:
      ```bash
      pnpm launch-blockers
      ```
      All 10 PASS (no published seed leakage, all licensed images, etc.).
- [ ] **Admin login enforces TOTP**: cannot reach `/admin/products`
      without `aal2` claim. Probe: open `/admin/products` in incognito
      → 302 to `/login`.
- [ ] **Service-role key NOT in any client bundle**:
      ```bash
      cd web && pnpm build
      grep -r "$(echo -n $SUPABASE_SERVICE_ROLE_KEY | head -c 8)" .next/static && echo "LEAK" || echo "clean"
      ```
- [ ] **CSP headers** on every public route:
      ```bash
      curl -sI https://<live>/ | grep -i content-security
      curl -sI https://<live>/p/<slug> | grep -i content-security
      ```
- [ ] **hCaptcha + Upstash creds** configured (P2-T01 — owner-blocked
      until creds delivered).

## Section 7 — Ops + monitoring

- [ ] **Backup workflow last 5 runs green** (after cutover, Section 0).
      ```bash
      gh run list --workflow=backup.yml --limit 5
      ```
- [ ] **Restore drill** done in the last 7 days (P5-T07). Latest:
      2026-06-09. Update this line on each drill.
- [ ] **Broken-image cron** has run successfully overnight (P5-T06).
      Confirm at `/admin` → broken-images widget shows the latest count.
- [ ] **Sentry** receives a test error (P5-T05 — owner-blocked on DSN):
      ```
      Trigger an error from /admin/_diag → see it land in the Sentry
      project's "Issues" tab within 30s.
      ```
- [ ] **Analytics dashboard** shows a fresh session (P5-T05).

## Section 8 — Payments (gated on Razorpay keys)

- [ ] Razorpay **test-mode** end-to-end (P3-T26–T28 owner-blocked):
      ```
      Add an item to cart
      Checkout
      Pay with Razorpay test card (4111 1111 1111 1111)
      Land on /checkout/success with order ID
      /admin/orders/<id> shows status=paid + signature verified
      ```
- [ ] **Webhook receiver** responds 200 to a Razorpay-dashboard test
      delivery.
- [ ] **LIVE keys swapped**: `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`
      are LIVE not test in Vercel env. Webhook URL points at the live
      origin.
- [ ] **Refund flow** documented: Razorpay-dashboard initiates refund;
      admin clicks "Mark refunded" to record the audit row.

## Section 9 — Real content

- [ ] **Real product corpus loaded** (P4-T10 — owner-blocked on
      content). At least 20 published products with real Bhavani photos
      and real descriptions; no `is_published=true` row has
      `source='justkraft_seed'`.
- [ ] **Images re-hosted to Supabase Storage** where appropriate
      (P4-T11 — owner-blocked). Spot check: `select count(*) from
      product_images where url like '%djl2kq23xfhqi.cloudfront.net%'`
      → owner accepts the count.
- [ ] **Atlas tile photos** chosen (8 categories × ≥ 1600px each).
- [ ] **Weekly Collection** features picked.
- [ ] **Bulk-enquiry CTA** points at the live WhatsApp number (set in
      `/admin/settings`).

## Section 10 — DNS + domain

- [ ] **Domain registered** (owner brings).
- [ ] **DNS records** point at Vercel per Vercel's "Add Domain" flow.
      Apex (A record) + www (CNAME). TTL ≤ 1h during launch week.
- [ ] **Both apex + www resolve** and serve the same site (one
      redirects to the other; convention is apex → www).
- [ ] **HTTPS certificate** provisioned (Vercel auto-issues via Let's
      Encrypt).
- [ ] `NEXT_PUBLIC_SITE_URL` in Vercel env set to the live origin (no
      trailing slash). Triggers metadata + sitemap to use the new
      origin.
- [ ] **Sitemap** at `https://<live>/sitemap.xml` resolves and lists
      `https://<live>/...` URLs (not the Vercel preview origin).

---

## Sign-off

- [ ] Owner has walked through every section above.
- [ ] Any unchecked item has an explicit "won't-fix-for-launch" reason
      recorded here:

  | Section | Item | Reason | Re-check by |
  |---|---|---|---|

- [ ] Owner signs off on launch: `_______________  (name)  ___ (date)`

---

## Day-after checklist (24h post-launch)

- [ ] First nightly backup ran (`gh run list --workflow=backup.yml
      --limit 2`).
- [ ] First nightly broken-image sweep ran.
- [ ] Sentry: no unexpected errors above the noise floor.
- [ ] Analytics: at least one real anon session captured.
- [ ] First order placed (test by owner) shows up in `/admin/orders`.

## Week-after checklist

- [ ] First real customer order processed end-to-end (paid, shipped,
      delivered, marked refunded if applicable).
- [ ] Lighthouse Perf score from PageSpeed Insights against the live
      domain (not preview) is within budget.
- [ ] Search-console — sitemap submitted, indexing in progress
      (P5-T03).

---

## Related runbooks

- [`backup-and-restore.md`](backup-and-restore.md) — backup + restore
  paths, retention policy, last-verified date.
- [`promote-admin-user.md`](promote-admin-user.md) — first admin
  promotion + TOTP enrollment.
- [`deploy-vercel.md`](deploy-vercel.md) — Vercel project + env vars
  reference.
- [`rotate-secrets.md`](rotate-secrets.md) — secret rotation
  procedure (Supabase service-role, Razorpay keys, etc.).
- [`restore-from-backup.md`](restore-from-backup.md) — full SQL restore
  procedure if the snapshot path isn't enough.

## Related scripts

```bash
cd web
pnpm launch-blockers           # content + RLS spot checks
pnpm rls-attack --live         # anon posture sweep
pnpm backup:live               # manual JSON snapshot
pnpm restore:live <dir>        # dry-run restore drill
pnpm sweep-broken-images       # one-off catalogue hygiene
```
