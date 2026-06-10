/**
 * Next 16 instrumentation hook (P5-T05).
 *
 * Loads the right Sentry init for the current runtime. `register()` runs
 * once per server-instance startup. `onRequestError` captures every
 * server-side error Next surfaces (server actions, route handlers, RSC).
 *
 * Both no-op cleanly when SENTRY_DSN is unset.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
