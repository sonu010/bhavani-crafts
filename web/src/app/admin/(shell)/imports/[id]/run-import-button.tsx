"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runImportAction } from "../actions";

/**
 * Synchronous "Run import" trigger. Applies every staged create/update
 * row, writes audit rows, revalidates. Idempotent — already-applied
 * rows (`applied_at IS NOT NULL`) are skipped on re-run.
 */
export function RunImportButton({
  runId,
  disabled,
}: {
  runId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startRun] = useTransition();

  const onRun = () => {
    if (
      !window.confirm(
        "Apply staged rows to the catalog? Creates land as 'needs_review'; updates re-target existing SKUs. Re-run is safe (already-applied rows are skipped).",
      )
    )
      return;
    startRun(async () => {
      const r = await runImportAction(runId);
      if (r.ok) {
        toast.success(
          `Applied ${r.applied} · failed ${r.failed} · skipped ${r.skipped}`,
        );
        router.refresh();
      } else if (r.error.code === "already_running") {
        toast.error("Another worker is running this import");
      } else {
        toast.error("Import not found");
      }
    });
  };

  return (
    <Button type="button" onClick={onRun} disabled={disabled || isPending}>
      <Play className="size-4" />
      {isPending ? "Running…" : "Run import"}
    </Button>
  );
}
