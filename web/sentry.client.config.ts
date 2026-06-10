/**
 * Sentry — client init (P5-T05).
 *
 * Runs in every browser context. Catches uncaught exceptions in React
 * components, click handlers, server-action POSTs that crashed in flight.
 * `NEXT_PUBLIC_SENTRY_DSN` is the client-readable mirror of the server
 * `SENTRY_DSN` env. We don't auto-share — keeping them separate lets the
 * operator turn off browser-side telemetry while keeping server-side on
 * (or vice versa) without redeploying.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0.0, // Session Replay off — too costly + privacy.
    replaysSessionSampleRate: 0.0,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",

    /**
     * Filter out errors customers can't act on and we can't fix:
     *   - AbortError when the user navigates away mid-fetch
     *   - hydration mismatches in dev only (caused by React StrictMode)
     */
    ignoreErrors: [
      "AbortError",
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
    ],
  });
}
