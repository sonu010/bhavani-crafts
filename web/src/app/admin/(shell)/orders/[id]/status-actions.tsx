"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminOrderStatus } from "@/lib/db/admin/orders";
import {
  markOrderCancelledAction,
  markOrderPaidAction,
  markOrderRefundedAction,
} from "./actions";

/**
 * Admin order status-flip buttons (rendered in the detail aside).
 *
 * Three actions, gated on the current status:
 *   pending_payment → "Mark paid", "Mark cancelled"
 *   paid           → "Mark refunded"
 *   anything else   → no buttons (the status is terminal in MVP scope)
 *
 * Each opens a Dialog to confirm — these flips touch real money
 * (admin marks a WhatsApp payment as received, etc.) and shouldn't
 * be a misclick away. The router.refresh() at the end re-fetches the
 * server-rendered detail so the new status + timestamp appear.
 */

type ActionFn = () => Promise<
  { ok: true; orderNumber: string } | { ok: false; error: string }
>;

export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: AdminOrderStatus;
}) {
  if (status === "failed" || status === "cancelled" || status === "refunded") {
    return null;
  }

  return (
    <section className="rounded-lg border border-husk-200 bg-paper-0 p-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
        Actions
      </h2>
      <div className="flex flex-col gap-2">
        {status === "pending_payment" ? (
          <>
            <FlipDialog
              triggerLabel="Mark paid"
              triggerIcon={<Check className="size-3.5" />}
              triggerVariant="default"
              title="Mark this order paid?"
              description="Use this when you've confirmed payment outside Razorpay (WhatsApp UPI, bank transfer). The order moves to 'Paid' with a timestamp, and the flip is logged in the audit trail."
              confirmLabel="Mark paid"
              successMsg="Order marked paid."
              action={() => markOrderPaidAction(orderId)}
            />
            <FlipDialog
              triggerLabel="Cancel order"
              triggerIcon={<X className="size-3.5" />}
              triggerVariant="outline"
              title="Cancel this order?"
              description="Use when the customer abandoned the order or you decided not to fulfil it. The row stays for the audit trail but customers can't pay it any more."
              confirmLabel="Cancel order"
              successMsg="Order cancelled."
              action={() => markOrderCancelledAction(orderId)}
            />
          </>
        ) : null}
        {status === "paid" ? (
          <FlipDialog
            triggerLabel="Mark refunded"
            triggerIcon={<RotateCcw className="size-3.5" />}
            triggerVariant="outline"
            title="Mark this order refunded?"
            description="Use AFTER you've processed the refund in the Razorpay dashboard. This tag records that the row has been refunded — it does NOT trigger a refund itself."
            confirmLabel="Mark refunded"
            successMsg="Order marked refunded."
            action={() => markOrderRefundedAction(orderId)}
          />
        ) : null}
      </div>
    </section>
  );
}

function FlipDialog(props: {
  triggerLabel: string;
  triggerIcon: React.ReactNode;
  triggerVariant: "default" | "outline";
  title: string;
  description: string;
  confirmLabel: string;
  successMsg: string;
  action: ActionFn;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      try {
        const res = await props.action();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(props.successMsg);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={props.triggerVariant}
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        {props.triggerIcon}
        {props.triggerLabel}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-stone-600">{props.description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Working…
              </>
            ) : (
              props.confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
