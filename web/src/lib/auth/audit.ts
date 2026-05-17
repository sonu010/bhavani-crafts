/**
 * Writes auth-attempt rows to `audit_logs` via the service-role client.
 *
 * audit_logs RLS forbids client writes (`architecture/security.md` §"RLS
 * policies": "all inserts via service-role from server actions, no client
 * policy permits insert"). The /login server action is the only path that
 * needs to insert as an unauthenticated user, so it's allowed to import
 * lib/db/admin.ts — the ESLint guard treats `app/login/**` like other
 * admin paths.
 *
 * If the insert fails we throw. Engineering principles: no silent catches.
 * A broken audit log is a deploy-blocker; we'd rather surface it via a
 * failed sign-in than serve a quietly half-broken auth flow.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export type AuthAction =
  | "auth.signin"
  | "auth.signin_failed"
  | "auth.signout"
  | "auth.mfa_enroll"
  | "auth.mfa_verify"
  | "auth.mfa_verify_failed";

/**
 * audit_logs.entity_id is `uuid NOT NULL`. Failed sign-ins don't identify
 * a user, so we use this sentinel UUID. The attempted email goes into
 * after_json.attempted_email so admins can still spot brute-force.
 */
export const ANONYMOUS_AUTH_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

export interface AuthAttemptInput {
  /** Profile id for successes; null when the attempt didn't identify a user. */
  actorId: string | null;
  action: AuthAction;
  /**
   * UUID identifying the row. Use the user id for any attempt where the
   * user is known (success, failed-MFA-after-password-ok, sign-out). For
   * pre-identification failures pass ANONYMOUS_AUTH_ENTITY_ID and stash
   * the attempted email in afterJson.attempted_email.
   */
  entityId: string;
  /** Free-form context: ip, user agent, mfa level, attempted email, etc. */
  afterJson: Record<string, unknown> | null;
  requestId: string | null;
}

export async function recordAuthAttempt(admin: SC, input: AuthAttemptInput): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: "session",
    entity_id: input.entityId,
    before_json: null,
    after_json: (input.afterJson ?? null) as never,
    request_id: input.requestId,
  });
  if (error) {
    throw new Error(`recordAuthAttempt: insert failed — ${error.message}`);
  }
}
