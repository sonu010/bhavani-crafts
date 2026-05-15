# Observability

What we measure, where it goes, who looks at it.

## Tools

| Tool | Free tier? | Used for |
|---|---|---|
| **Sentry** | Yes (5k events/mo) | Client + server errors; performance traces (10% sample) |
| **Vercel Speed Insights** | Yes (Pro/Enterprise) | Real-user Web Vitals (LCP, INP, CLS) |
| **Vercel Analytics** | Yes | Page-level pageviews, cookieless |
| **Plausible** (optional) | Paid | Cookieless analytics if owner prefers external |
| **`audit_logs`** | — | Every admin mutation, owner-visible at `/admin/activity` |
| **`search_logs`** | — | All search queries + result counts; gold for catalog gaps |
| **`job_events`** | — | Per-chunk logs of background jobs |
| **Supabase slow-query log** | — | DB queries > 300 ms; reviewed weekly |
| **GitHub Actions** | — | Backup runs, broken-image cron status |

## Sentry setup

- Wrap the Next.js app with `@sentry/nextjs` (instrumentation hook for App Router).
- Server-side: capture every `throw` in server actions and route handlers. Use `Sentry.withScope` to attach `user.id` (from profile), `request.id`, and `entity.id` where relevant.
- Client-side: 100% error sample, 10% transaction sample. Filter out: hydration mismatches in dev, network errors caused by user navigating away (`AbortError`).
- Source maps uploaded on every prod deploy via Vercel integration.
- Release tag = git SHA. Lets us correlate errors to commits.

## Vercel Speed Insights

- Enabled in prod only (Vercel project setting).
- Tracks LCP, INP, CLS on real visits.
- Weekly review by the developer: any page where p75 LCP > 2.5s gets a perf-focused PR within the week.

## `audit_logs` admin view

Page at `/admin/activity`:
- Default filter: last 7 days, all entity types.
- Search by entity id, actor, action.
- Each row expands to show `before_json` and `after_json` side-by-side with a JSON diff highlighter.
- Export to CSV.

Insert pattern (every server action, after the DB commit):

```ts
await supabase.from('audit_logs').insert({
  actor_id: ctx.userId,
  action: 'product.update',
  entity_type: 'product',
  entity_id: product.id,
  before_json: before,
  after_json: after,
  request_id: ctx.requestId,
});
```

Never include secrets, raw passwords, or `service_role` operations' service-context in `before_json`/`after_json`. Sanitize by serializing the row via a Zod schema that omits sensitive fields.

## Dashboards (admin)

`/admin` dashboard cards (light, not overbuilt):

- **Catalog health** — total products, published, unpublished, out-of-stock, uncategorized.
- **This week's mutations** — count from `audit_logs` grouped by action.
- **Top searches with 0 results** — last 7 days from `search_logs`. Each row links to "Find a product that matches" (admin can create or relabel).
- **AI spend MTD** — sum of `ai_generations.usd_cost` for current month, vs cap from env. Yellow at 75%, red at 90%.
- **Broken images** — count of images flagged `disputed` by the nightly audit.
- **Background jobs** — last 5 with their status + progress.

## Alert routes

| Trigger | Alert to | How |
|---|---|---|
| Server error captured by Sentry | Owner's email + Sentry inbox | Sentry default |
| AI spend ≥ 75% of monthly cap | Owner's email | Edge Function comparing `sum(usd_cost)` daily, sending via Resend |
| Backup GitHub Action failed | Owner's email | GitHub Action sends email on failure |
| RLS attack test failed in CI | Owner's email + PR comment | GitHub Action |

No PagerDuty, no Slack/Discord integration in MVP. Email is the channel.

## Logs we deliberately don't keep

- Raw request bodies — they may contain credentials in error scenarios.
- Customer IPs beyond Vercel's default access logs.
- Anonymous visitor analytics with cross-page identifiers (Plausible or Vercel Analytics is the choice, both cookieless).
