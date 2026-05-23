"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/db/admin/jobs-public";
import { cancelJobAction, retryJobAction } from "../actions";

/**
 * Retry/Cancel buttons. Retry shows only on `failed` jobs; Cancel
 * shows only on `queued` jobs. Running jobs are immutable — there's
 * no cooperative-cancel hook in the worker yet.
 */
export function JobActions({
  jobId,
  status,
}: {
  jobId: string;
  status: JobStatus;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [cancelling, startCancel] = useTransition();

  if (status === "failed") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={retrying}
        onClick={() =>
          startRetry(async () => {
            const r = await retryJobAction(jobId);
            if (r.ok) {
              toast.success("Re-queued");
              router.refresh();
            } else if (r.error.code === "wrong_status") {
              toast.error(`Cannot retry — current status: ${r.error.current}`);
            } else {
              toast.error("Could not retry");
            }
          })
        }
      >
        <RotateCcw className="size-3.5" />
        {retrying ? "Re-queueing…" : "Retry from checkpoint"}
      </Button>
    );
  }

  if (status === "queued") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={cancelling}
        onClick={() => {
          if (!window.confirm("Cancel this queued job?")) return;
          startCancel(async () => {
            const r = await cancelJobAction(jobId);
            if (r.ok) {
              toast.success("Cancelled");
              router.refresh();
            } else if (r.error.code === "wrong_status") {
              toast.error(`Cannot cancel — current status: ${r.error.current}`);
            } else {
              toast.error("Could not cancel");
            }
          });
        }}
      >
        <XCircle className="size-3.5" />
        {cancelling ? "Cancelling…" : "Cancel"}
      </Button>
    );
  }

  return null;
}
