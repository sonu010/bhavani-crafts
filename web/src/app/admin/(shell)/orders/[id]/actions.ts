"use server";

/**
 * Admin order-status flip actions.
 *
 * Three transitions, all guarded by `requireAdminContext` + an audit
 * log row + a path revalidation. Mirrors the product-editor actions
 * pattern (lib/db/admin/products + audit_logs insert).
 *
 * Why these exist before Razorpay ships: when a customer goes through
 * /checkout while Razorpay keys are owner-pending, the order lands at
 * `pending_payment` and they're routed to /checkout/pending with a
 * WhatsApp follow-up link. The owner reads that thread, decides what
 * to do, and flips the order from /admin/orders/<id> by hand. These
 * actions are also useful AFTER Razorpay is live for edge cases —
 * manually closing abandoned carts, recording dashboard-side refunds.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  markOrderCancelled,
  markOrderPaid,
  markOrderRefunded,
  type StatusFlipError,
} from "@/lib/db/admin/order-status";

type ActionResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string };

function describeError(error: StatusFlipError): string {
  if (error.code === "not_found") return "Order not found.";
  return `Can't flip from ${error.from} to ${error.to}.`;
}

async function writeAudit(
  admin: Parameters<typeof markOrderPaid>[0],
  opts: {
    actorId: string;
    action: "order.mark_paid" | "order.mark_cancelled" | "order.mark_refunded";
    entityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    requestId: string;
  },
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: opts.actorId,
    action: opts.action,
    entity_type: "order",
    entity_id: opts.entityId,
    before_json: opts.before as never,
    after_json: opts.after as never,
    request_id: opts.requestId,
  });
  // Engineering principle: audit gaps are a deploy-blocker. Fail loud
  // rather than continue with a silent half-loss.
  if (error) {
    throw new Error(`order audit insert: ${error.message}`);
  }
}

export async function markOrderPaidAction(id: string): Promise<ActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await markOrderPaid(admin, id);
  if (!result.ok) return { ok: false, error: describeError(result.error) };

  await writeAudit(admin, {
    actorId: user.id,
    action: "order.mark_paid",
    entityId: id,
    before: result.before as unknown as Record<string, unknown>,
    after: result.after as unknown as Record<string, unknown>,
    requestId,
  });

  // The list page is rendered dynamic but other consumers (dashboard
  // counts later) may cache reads off this row.
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);

  return { ok: true, orderNumber: result.after.order_number };
}

export async function markOrderCancelledAction(
  id: string,
): Promise<ActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await markOrderCancelled(admin, id);
  if (!result.ok) return { ok: false, error: describeError(result.error) };

  await writeAudit(admin, {
    actorId: user.id,
    action: "order.mark_cancelled",
    entityId: id,
    before: result.before as unknown as Record<string, unknown>,
    after: result.after as unknown as Record<string, unknown>,
    requestId,
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);

  return { ok: true, orderNumber: result.after.order_number };
}

export async function markOrderRefundedAction(
  id: string,
): Promise<ActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await markOrderRefunded(admin, id);
  if (!result.ok) return { ok: false, error: describeError(result.error) };

  await writeAudit(admin, {
    actorId: user.id,
    action: "order.mark_refunded",
    entityId: id,
    before: result.before as unknown as Record<string, unknown>,
    after: result.after as unknown as Record<string, unknown>,
    requestId,
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);

  return { ok: true, orderNumber: result.after.order_number };
}
