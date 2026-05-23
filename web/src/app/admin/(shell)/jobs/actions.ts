"use server";

/**
 * Background-job lifecycle actions. Both surface server-side
 * authz + audit + revalidation.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  appendJobEvent,
  cancelJob,
  retryJob,
  type JobActionError,
} from "@/lib/db/admin/jobs";

export type JobLifecycleResult =
  | { ok: true }
  | { ok: false; error: JobActionError };

export async function retryJobAction(id: string): Promise<JobLifecycleResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await retryJob(admin, id);
  if (!result.ok) return result;

  await appendJobEvent(admin, id, "info", `retry requested`, {
    actor_id: user.id,
    request_id: requestId,
  });

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "job.retry",
    entity_type: "background_job",
    entity_id: id,
    before_json: { status: "failed" } as never,
    after_json: { status: "queued" } as never,
    request_id: requestId,
  });
  if (auditErr) throw new Error(`retryJob audit: ${auditErr.message}`);

  updateTag("jobs");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${id}`);
  return { ok: true };
}

export async function cancelJobAction(id: string): Promise<JobLifecycleResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await cancelJob(admin, id);
  if (!result.ok) return result;

  await appendJobEvent(admin, id, "info", "cancelled by admin", {
    actor_id: user.id,
    request_id: requestId,
  });

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "job.cancel",
    entity_type: "background_job",
    entity_id: id,
    before_json: { status: "queued" } as never,
    after_json: { status: "cancelled" } as never,
    request_id: requestId,
  });
  if (auditErr) throw new Error(`cancelJob audit: ${auditErr.message}`);

  updateTag("jobs");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${id}`);
  return { ok: true };
}
