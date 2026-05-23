/**
 * Audit-log reader for /admin/activity.
 *
 * Cursor-paginated over `(created_at DESC, id DESC)` — the same shape
 * the products list uses. Filters are AND-composed and all optional.
 *
 * RLS posture: admin-only select policy from 0006. Cookie-bound server
 * client suffices — no service-role read required.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  request_id: string | null;
  has_diff: boolean;
}

export interface AuditLogDetail extends AuditLogRow {
  before_json: unknown;
  after_json: unknown;
}

export interface AuditListFilters {
  actorId?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  since?: string | null;
  until?: string | null;
}

export interface AuditCursor {
  created_at: string;
  id: string;
}

export const AUDIT_PER_PAGE = 50;

/**
 * Returns up to AUDIT_PER_PAGE rows + a `nextCursor` if more remain.
 *
 * Embeds the actor profile (name + email) so the table can render
 * "Alex" instead of a UUID. Failed-login entries set
 * `entity_id` to the anonymous sentinel and `actor_id` to NULL —
 * those rows show as "—" with the email pulled from after_json by
 * the panel renderer.
 */
export async function listAuditLogs(
  supabase: SC,
  filters: AuditListFilters,
  cursor: AuditCursor | null,
): Promise<{ rows: AuditLogRow[]; nextCursor: AuditCursor | null }> {
  let q = supabase
    .from("audit_logs")
    .select(
      "id, actor_id, action, entity_type, entity_id, created_at, request_id, before_json, after_json, actor:profiles!audit_logs_actor_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_PER_PAGE + 1);

  if (filters.actorId) q = q.eq("actor_id", filters.actorId);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.entityType) q = q.eq("entity_type", filters.entityType);
  if (filters.entityId) q = q.eq("entity_id", filters.entityId);
  if (filters.since) q = q.gte("created_at", filters.since);
  if (filters.until) q = q.lte("created_at", filters.until);

  if (cursor) {
    // Keyset: rows strictly older than (created_at, id) of the last
    // row on the previous page. PostgREST doesn't expose a row-tuple
    // comparator so split into the two SQL conditions:
    //   created_at < cursor.created_at
    //   OR (created_at = cursor.created_at AND id < cursor.id)
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(`listAuditLogs: ${error.message}`);

  type Raw = {
    id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    request_id: string | null;
    before_json: unknown;
    after_json: unknown;
    actor: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const raw = (data ?? []) as Raw[];

  // Actor emails live in auth.users — separate lookup. Skip when the
  // page has no rows. The Supabase JS client doesn't expose auth.users
  // via the regular query interface; use the admin auth API.
  const actorIds = Array.from(
    new Set(raw.map((r) => r.actor_id).filter((x): x is string => !!x)),
  );
  const emailByActor = await fetchActorEmails(supabase, actorIds);

  const rows: AuditLogRow[] = raw.slice(0, AUDIT_PER_PAGE).map((r) => {
    const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
    return {
      id: r.id,
      actor_id: r.actor_id,
      actor_email: r.actor_id ? (emailByActor.get(r.actor_id) ?? null) : null,
      actor_name: actor?.full_name ?? null,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      created_at: r.created_at,
      request_id: r.request_id,
      has_diff: r.before_json !== null || r.after_json !== null,
    };
  });

  let nextCursor: AuditCursor | null = null;
  if (raw.length > AUDIT_PER_PAGE) {
    const last = rows[rows.length - 1];
    if (last) {
      nextCursor = { created_at: last.created_at, id: last.id };
    }
  }
  return { rows, nextCursor };
}

export async function getAuditLog(
  supabase: SC,
  id: string,
): Promise<AuditLogDetail | null> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, actor_id, action, entity_type, entity_id, created_at, request_id, before_json, after_json, actor:profiles!audit_logs_actor_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAuditLog: ${error.message}`);
  if (!data) return null;

  const emails = data.actor_id
    ? await fetchActorEmails(supabase, [data.actor_id])
    : new Map<string, string>();
  const actor = Array.isArray(data.actor) ? data.actor[0] : data.actor;
  return {
    id: data.id,
    actor_id: data.actor_id,
    actor_email: data.actor_id ? (emails.get(data.actor_id) ?? null) : null,
    actor_name: actor?.full_name ?? null,
    action: data.action,
    entity_type: data.entity_type,
    entity_id: data.entity_id,
    created_at: data.created_at,
    request_id: data.request_id,
    before_json: data.before_json,
    after_json: data.after_json,
    has_diff: data.before_json !== null || data.after_json !== null,
  };
}

/**
 * Resolve email addresses for a set of profile ids by going through
 * the Supabase admin auth API. Requires the client to have
 * `service_role` privileges; cookie-bound admin clients silently
 * return empty.
 */
async function fetchActorEmails(
  supabase: SC,
  actorIds: string[],
): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  // The admin auth API is exposed on `supabase.auth.admin`.
  // Iterate ids — listing all users would scan auth.users which is
  // overkill at our scale. The N round-trips are cheap; the page has
  // 50 rows max and most share a small set of actor_ids.
  const byId = new Map<string, string>();
  await Promise.all(
    actorIds.map(async (id) => {
      try {
        const r = await supabase.auth.admin.getUserById(id);
        if (!r.error && r.data?.user?.email) {
          byId.set(id, r.data.user.email);
        }
      } catch {
        // Swallow — the cookie-bound client doesn't have admin auth
        // privileges and that's expected. Email column shows "—".
      }
    }),
  );
  return byId;
}

/**
 * Distinct action verbs seen in the table. Used to populate the
 * filter combobox without hard-coding the vocabulary.
 *
 * Caller wraps in `unstable_cache(..., { tags: ['audit-actions'],
 * revalidate: 60 })` — admin doesn't add new action verbs often.
 */
export async function listDistinctActions(supabase: SC): Promise<string[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("action")
    .order("action", { ascending: true });
  if (error) throw new Error(`listDistinctActions: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r) => r.action))).sort();
}

export async function listDistinctEntityTypes(supabase: SC): Promise<string[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("entity_type")
    .order("entity_type", { ascending: true });
  if (error) throw new Error(`listDistinctEntityTypes: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r) => r.entity_type))).sort();
}
