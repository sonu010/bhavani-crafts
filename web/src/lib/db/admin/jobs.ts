/**
 * Admin background_jobs reader + lifecycle actions.
 *
 * Read paths are simple — newest first, optional filters by status +
 * kind. The retry / cancel actions are gated on the current row
 * status so we don't ever clobber a running job.
 *
 * RLS posture: `background_jobs` is admin-only select; service-role-
 * only insert (workers write). The cookie-bound admin client suffices
 * for the read path; the action layer's `requireAdminContext` hands
 * us the service-role client for writes.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import type { JobStatus } from "@/lib/db/admin/jobs-public";

type SC = SupabaseClient<Database>;

// Re-export the type from here so existing server imports keep working.
export type { JobStatus };

export interface JobRow {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  total: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface JobDetail extends JobRow {
  payload_json: unknown;
  result_json: unknown;
  checkpoint: unknown;
}

export interface JobEventRow {
  id: string;
  job_id: string;
  level: "info" | "warn" | "error";
  message: string;
  data_json: unknown;
  created_at: string;
}

export interface JobListFilters {
  statuses?: JobStatus[] | null;
  kind?: string | null;
}

export const JOBS_PER_PAGE = 50;

export async function listJobs(
  supabase: SC,
  filters: JobListFilters,
): Promise<JobRow[]> {
  let q = supabase
    .from("background_jobs")
    .select(
      "id, kind, status, progress, total, error, created_by, created_at, started_at, finished_at",
    )
    .order("created_at", { ascending: false })
    .limit(JOBS_PER_PAGE);

  if (filters.statuses && filters.statuses.length > 0) {
    q = q.in("status", filters.statuses);
  }
  if (filters.kind) {
    q = q.eq("kind", filters.kind);
  }

  const { data, error } = await q;
  if (error) throw new Error(`listJobs: ${error.message}`);
  return (data ?? []) as JobRow[];
}

export async function getJob(
  supabase: SC,
  id: string,
): Promise<JobDetail | null> {
  const { data, error } = await supabase
    .from("background_jobs")
    .select(
      "id, kind, status, progress, total, error, created_by, created_at, started_at, finished_at, payload_json, result_json, checkpoint",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getJob: ${error.message}`);
  if (!data) return null;
  return data as JobDetail;
}

export async function listJobEvents(
  supabase: SC,
  jobId: string,
): Promise<JobEventRow[]> {
  const { data, error } = await supabase
    .from("job_events")
    .select("id, job_id, level, message, data_json, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`listJobEvents: ${error.message}`);
  return (data ?? []).map((r) => ({
    ...r,
    level: r.level as "info" | "warn" | "error",
  }));
}

export async function listDistinctJobKinds(supabase: SC): Promise<string[]> {
  const { data, error } = await supabase
    .from("background_jobs")
    .select("kind")
    .order("kind", { ascending: true });
  if (error) throw new Error(`listDistinctJobKinds: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r) => r.kind))).sort();
}

export type JobActionError =
  | { code: "not_found" }
  | { code: "wrong_status"; current: JobStatus };

/**
 * Re-queue a failed job. Worker picks it up on the next tick and
 * resumes from the `checkpoint` payload — we don't clear it here.
 * The error column gets cleared so a fresh failure can populate it.
 */
export async function retryJob(
  supabase: SC,
  id: string,
): Promise<{ ok: true } | { ok: false; error: JobActionError }> {
  const cur = await supabase
    .from("background_jobs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (cur.error) throw new Error(`retryJob (lookup): ${cur.error.message}`);
  if (!cur.data) return { ok: false, error: { code: "not_found" } };
  if (cur.data.status !== "failed") {
    return { ok: false, error: { code: "wrong_status", current: cur.data.status } };
  }
  const upd = await supabase
    .from("background_jobs")
    .update({ status: "queued", error: null, finished_at: null })
    .eq("id", id)
    .eq("status", "failed"); // belt + suspenders against a race
  if (upd.error) throw new Error(`retryJob (update): ${upd.error.message}`);
  return { ok: true };
}

/**
 * Cancel a still-queued job. Running jobs can't be cancelled
 * mid-tick — the worker doesn't currently check a cancel flag.
 * Cooperative cancellation lands when the worker grows that hook.
 */
export async function cancelJob(
  supabase: SC,
  id: string,
): Promise<{ ok: true } | { ok: false; error: JobActionError }> {
  const cur = await supabase
    .from("background_jobs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (cur.error) throw new Error(`cancelJob (lookup): ${cur.error.message}`);
  if (!cur.data) return { ok: false, error: { code: "not_found" } };
  if (cur.data.status !== "queued") {
    return { ok: false, error: { code: "wrong_status", current: cur.data.status } };
  }
  const upd = await supabase
    .from("background_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued");
  if (upd.error) throw new Error(`cancelJob (update): ${upd.error.message}`);
  return { ok: true };
}

export async function appendJobEvent(
  supabase: SC,
  jobId: string,
  level: "info" | "warn" | "error",
  message: string,
  data: unknown = null,
): Promise<void> {
  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    level,
    message,
    data_json: data as never,
  });
  if (error) throw new Error(`appendJobEvent: ${error.message}`);
}
