/**
 * Sentry — edge runtime init (P5-T05).
 *
 * Runs in middleware (`proxy.ts`) and any handler exporting
 * `runtime = "edge"`. Same DSN, same sampling, same gating-on-env
 * pattern as the server config — but ImageResponse handlers and middleware
 * code can't load the Node-only `beforeSend` PII scrubber, so this one is
 * intentionally simpler.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
  });
}
