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

Wired in P5-T05; no-ops cleanly when DSN env vars are unset, so the SDK can ship before the owner has provisioned the Sentry project.

Files:

| File | Runtime | Purpose |
|---|---|---|
| `web/sentry.server.config.ts` | nodejs | Server actions, RSC, route handlers. PII scrub on `extra.order` and `request.cookies`. |
| `web/sentry.edge.config.ts` | edge | Middleware (`proxy.ts`) + edge route handlers. |
| `web/sentry.client.config.ts` | browser | React client components. `ignoreErrors` filters AbortError + ResizeObserver noise. |
| `web/instrumentation.ts` | both | Dispatches to the right config per `NEXT_RUNTIME`. Exports `onRequestError = Sentry.captureRequestError`. |
| `web/next.config.ts` | build | `withSentryConfig` wrap. `tunnelRoute: "/monitoring"` defeats ad-blockers blocking sentry.io. Source-map upload gated on `SENTRY_AUTH_TOKEN`. |

Env vars (all four optional, all read from `.env.local` / Vercel):

- `SENTRY_DSN` — server + edge runtime
- `NEXT_PUBLIC_SENTRY_DSN` — browser
- `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` — source-map upload at build (Vercel only)

Sampling:

- `sampleRate: 1.0` for errors (capture every throw).
- `tracesSampleRate: 0.1` for performance traces; drop to 0.01 once volume picks up.
- Session Replay off (`replaysOnErrorSampleRate: 0.0`) — too costly + privacy.

PII scrub:

- `extra.order` redacts customer_name / customer_email / customer_phone / shipping_address / name / email / phone to `<scrubbed>`.
- `request.cookies` redacts entirely (carries the Supabase auth session token).
- Add new scrub keys to the `beforeSend` list whenever a new PII surface lands.

Storefront wiring:

- `web/src/lib/storefront/safe-read.ts` calls `Sentry.captureException` inside its catch, tagged `source: "storefront-safe-read"` + `key: <label>`. The fallback still renders (customers see no broken page); the owner gets the alert.
- Release tag = `VERCEL_GIT_COMMIT_SHA`. Lets us correlate errors to commits.

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
