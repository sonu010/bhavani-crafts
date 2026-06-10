/**
 * Sentry — server-side init (P5-T05).
 *
 * Runs in every Node-runtime context: server actions, route handlers,
 * RSC trees. Edge runtime has its own config (`sentry.edge.config.ts`).
 *
 * No-ops cleanly when `SENTRY_DSN` is unset. That's the launch posture
 * until the owner provisions the Sentry project: we ship the wiring;
 * one env var swap turns it on.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Capture every error — no sampling on errors.
    sampleRate: 1.0,
    // 10% transaction sample for the first month; drop to 1% later.
    tracesSampleRate: 0.1,
    // Tag every event so we can filter by environment in the UI.
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,

    /**
     * Scrub PII before send. Customer orders contain name/email/phone/
     * address — these are user-supplied identifiers and must NOT land in
     * Sentry's error timeline. Anything attached to `extra.order`
     * (typically by createCheckoutOrder server action) gets redacted.
     */
    beforeSend(event) {
      const extra = event.extra as Record<string, unknown> | undefined;
      if (extra && typeof extra.order === "object" && extra.order !== null) {
        const order = extra.order as Record<string, unknown>;
        for (const k of [
          "customer_name",
          "customer_email",
          "customer_phone",
          "shipping_address",
          "name",
          "email",
          "phone",
        ]) {
          if (k in order) order[k] = "<scrubbed>";
        }
        event.extra = { ...extra, order };
      }
      // Strip request cookies, which carry the Supabase auth session.
      if (event.request?.cookies) {
        event.request.cookies = { redacted: "<scrubbed>" };
      }
      return event;
    },
  });
}
