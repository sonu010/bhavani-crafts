/**
 * Client-importable types + constants for background_jobs.
 *
 * No `server-only` directive so client components (filter bar,
 * jobs table) can import runtime values without pulling the data
 * layer's server-side helpers into the client bundle.
 */
import type { Database } from "@/lib/db/types.gen";

export type JobStatus = Database["public"]["Enums"]["job_status"];

export const JOB_STATUSES: JobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);
