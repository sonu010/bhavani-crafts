"use client";

import { useCallback, useState, useTransition } from "react";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PreflightResult } from "@/lib/db/admin/publish";
import {
  generatePreviewLinkAction,
  publishProductAction,
  unpublishProductAction,
} from "../actions";

/**
 * Publish tab. Three sections:
 *
 *   1. Status banner — current `is_published` + `review_status` so the
 *      owner knows what state they're flipping.
 *   2. Pre-flight checklist — passes / warnings / blockers from
 *      `runProductPreflight`. Blockers gate the Publish button.
 *   3. Actions row — Preview link + Publish/Unpublish.
 *
 * Preflight is server-rendered on mount. After a publish/unpublish
 * action we reload the page to pull a fresh preflight + the other
 * tabs' read-throughs.
 */
export function PublishTab({
  productId,
  initialPreflight,
  initialStatus,
}: {
  productId: string;
  initialPreflight: PreflightResult;
  initialStatus: {
    is_published: boolean;
    review_status: string;
  };
}) {
  const [publishing, startPublish] = useTransition();
  const [unpublishing, startUnpublish] = useTransition();
  const [generating, setGenerating] = useState(false);

  const onPublish = useCallback(() => {
    startPublish(async () => {
      const r = await publishProductAction(productId);
      if (r.ok) {
        toast.success("Published");
        window.location.reload();
        return;
      }
      if (r.error.code === "preflight_failed") {
        toast.error(
          `Preflight failed: ${r.error.failures.join(", ")}. Fix and retry.`,
        );
      } else if (r.error.code === "not_found") {
        toast.error("Product not found");
      }
    });
  }, [productId]);

  const onUnpublish = useCallback(() => {
    if (!window.confirm("Unpublish this product? It will disappear from the storefront."))
      return;
    startUnpublish(async () => {
      const r = await unpublishProductAction(productId);
      if (r.ok) {
        toast.success("Unpublished");
        window.location.reload();
      } else {
        toast.error("Could not unpublish");
      }
    });
  }, [productId]);

  const onPreview = useCallback(async () => {
    setGenerating(true);
    try {
      const r = await generatePreviewLinkAction(productId);
      if (r.ok) {
        window.open(r.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Could not generate preview link");
      }
    } finally {
      setGenerating(false);
    }
  }, [productId]);

  const canPublish = initialPreflight.canPublish;
  const published = initialStatus.is_published;

  return (
    <div className="space-y-6 pb-24">
      <div
        className={[
          "rounded-lg border p-4 text-sm",
          published
            ? "border-moss-400/60 bg-moss-50 text-moss-900"
            : "border-husk-200 bg-paper-0 text-bark-900",
        ].join(" ")}
      >
        <p className="font-medium">{published ? "Published" : "Not published"}</p>
        <p className="mt-1 font-mono text-xs text-stone-500">
          is_published = {String(initialStatus.is_published)} · review_status ={" "}
          {initialStatus.review_status}
        </p>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Pre-flight
        </legend>
        <ul className="space-y-2">
          {initialPreflight.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.passed ? (
                <Check className="mt-0.5 size-4 shrink-0 text-moss-700" />
              ) : c.level === "blocking" ? (
                <X className="mt-0.5 size-4 shrink-0 text-brick-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-saffron-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-bark-900">{c.label}</p>
                {c.detail ? (
                  <p className="font-mono text-xs text-stone-500">{c.detail}</p>
                ) : null}
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase",
                  c.passed
                    ? "bg-moss-100 text-moss-800"
                    : c.level === "blocking"
                      ? "bg-brick-50 text-brick-700"
                      : "bg-saffron-50 text-clay-700",
                ].join(" ")}
              >
                {c.passed ? "pass" : c.level}
              </span>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onPreview}
          disabled={generating}
        >
          <ExternalLink className="size-4" />
          {generating ? "Generating…" : "Preview as anonymous"}
        </Button>

        <div className="flex items-center gap-2">
          {published ? (
            <Button
              type="button"
              variant="outline"
              onClick={onUnpublish}
              disabled={unpublishing || publishing}
            >
              {unpublishing ? "Unpublishing…" : "Unpublish"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onPublish}
              disabled={!canPublish || publishing || unpublishing}
              title={
                canPublish
                  ? "Set is_published=true, review_status='published'"
                  : "Fix blocking pre-flight checks first"
              }
            >
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-stone-500">
        Preview links are signed JWTs that expire after 15 minutes. The
        storefront PDP (Phase 3) honors them in place of{" "}
        <span className="font-mono">is_published</span> for the matching
        product only.
      </p>
    </div>
  );
}
