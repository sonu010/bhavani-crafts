---
id: P5-T03
phase: 5
title: Sitemap + robots.txt verify on live + GSC
status: not_started
depends_on: [P5-T00, P5-T01, P5-T02]
estimate_hours: 1
owner: shared
last_updated: 2026-06-07
---

# Goal

The routes + helpers already shipped in P3-T24 (`web/src/app/sitemap.ts`
+ `web/src/app/robots.ts` + `listAllPublishedSlugs` /
`listAllCategorySlugs` with paginated reads). This task is the
launch-day verification that they actually serve correctly from the
live domain and are submitted to Google Search Console + Bing
Webmaster Tools.

After this task:
- `https://<live-domain>/sitemap.xml` is reachable + has every
  published PDP + every non-deleted category + the static routes
  (/, /search, /about, /contact, /policies/*).
- `https://<live-domain>/robots.txt` allows `/`, disallows `/admin
  /auth /api /design`, points at the live sitemap URL.
- The sitemap is submitted to Google Search Console (owner's
  Search Console property).
- The sitemap is submitted to Bing Webmaster Tools.

# Prerequisites (read first)

- `web/src/app/sitemap.ts` — current implementation (paginated reads,
  3600s revalidate, static + product + category URLs)
- `web/src/app/robots.ts` — disallow-list (admin/auth/api/design)
- `web/__tests__/db/sitemap-helpers.test.ts` — pinned: published-only,
  soft-deleted excluded, updated_at carries through
- `web/e2e/anon/seo.spec.ts` — already asserts sitemap shape

# Files to touch

- `web/src/app/sitemap.ts` (modified, maybe) — add static routes for
  /about + /contact + /policies/* once P5-T01 + T02 ship
- `claude/runbooks/launch-day.md` (new or modified) — checklist
  including GSC submission steps + the Bing flow
- No code changes if the policies + about/contact pages are picked
  up by the existing static list

# Implementation notes

- **Verify live URLs before submitting:**
  ```bash
  curl -s https://<live-domain>/robots.txt | head -20
  curl -s https://<live-domain>/sitemap.xml | grep -c "<url>"  # count
  ```
  Expect ≥ 50 entries on a stocked catalog.
- **Add new static routes:** update `STATIC_ROUTES` in sitemap.ts so
  the four policy pages + /about + /contact appear. T01 + T02
  acceptance criteria already say "in sitemap.xml" — this is where
  that gets enforced.
- **GSC submission:**
  1. Owner verifies domain ownership via the TXT record method (1×).
  2. Sitemap → submit `https://<live-domain>/sitemap.xml`.
  3. URL inspection: spot-check 2-3 PDP URLs to confirm
     index-eligible (no noindex header, valid robots.txt).
- **Bing Webmaster Tools:** Same URL submitted to the Bing equivalent.
  Less critical but takes 2 minutes.
- **Sentry / Plausible:** NOT this task — see P5-T05.

# Acceptance criteria

- [ ] `curl /sitemap.xml` returns 200 from the live domain.
- [ ] Sitemap contains the four policy URLs + /about + /contact.
- [ ] Every URL in the sitemap is anon-reachable (returns 200).
- [ ] `curl /robots.txt` correctly disallows /admin /auth /api /design.
- [ ] Sitemap submitted to GSC; status shows "Couldn't fetch" → wait
      24h → "Success."
- [ ] Sitemap submitted to Bing Webmaster Tools.
- [ ] Runbook `claude/runbooks/launch-day.md` documents the steps.

# Verification

```bash
# Local + live
pnpm playwright test e2e/anon/seo.spec.ts

# Live spot-check
curl -s https://<live-domain>/sitemap.xml | python3 -c '
import xml.etree.ElementTree as ET, sys
root = ET.fromstring(sys.stdin.read())
ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
urls = [u.find("sm:loc", ns).text for u in root.findall("sm:url", ns)]
print(f"{len(urls)} URLs")
for u in urls[:10]: print("  ", u)
'
```

# Notes for next agent

(empty)
