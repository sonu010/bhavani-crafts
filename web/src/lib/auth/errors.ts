/**
 * Typed auth errors used by `requireRole`, `requireAAL2`, and the Edge
 * proxy. Each carries an HTTP status and an optional redirect target so
 * callers (proxy, server actions, route handlers, global error boundary)
 * can map a single exception to the right response without re-deciding.
 *
 * See claude/architecture/auth-and-roles.md §"Three layers of authorization".
 */

export type AuthErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "mfa-not-enrolled"
  | "mfa-not-verified";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly redirectTo: string | null;

  constructor(opts: {
    code: AuthErrorCode;
    status: number;
    redirectTo: string | null;
    message: string;
  }) {
    super(opts.message);
    this.name = "AuthError";
    this.code = opts.code;
    this.status = opts.status;
    this.redirectTo = opts.redirectTo;
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(message = "no session") {
    super({
      code: "unauthenticated",
      status: 401,
      redirectTo: "/login",
      message,
    });
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string) {
    super({
      code: "forbidden",
      status: 403,
      // Server actions render /admin/forbidden via the global error
      // boundary; the proxy never redirects on forbidden (it would loop).
      redirectTo: null,
      message,
    });
    this.name = "ForbiddenError";
  }
}

export class MFANotEnrolledError extends AuthError {
  constructor(message = "owner-role account has no verified TOTP factor") {
    super({
      code: "mfa-not-enrolled",
      status: 403,
      redirectTo: "/admin/2fa-setup",
      message,
    });
    this.name = "MFANotEnrolledError";
  }
}

export class MFANotVerifiedError extends AuthError {
  constructor(message = "session is AAL1; AAL2 required") {
    super({
      code: "mfa-not-verified",
      status: 403,
      redirectTo: "/auth/verify-2fa",
      message,
    });
    this.name = "MFANotVerifiedError";
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
