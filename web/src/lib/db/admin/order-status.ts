import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

/**
 * Admin status-flip helpers for the orders table (P3.5 / pre-Razorpay).
 *
 * Three valid transitions in the MVP scope:
 *   pending_payment → paid       (manual confirmation via WhatsApp)
 *   pending_payment → cancelled  (admin walks away before payment)
 *   paid           → refunded    (after the owner refunds via Razorpay
 *                                 dashboard; just tagging the row to
 *                                 keep the audit trail honest)
 *
 * Every flip:
 *   1. Re-reads the row inside the function so we can return the
 *      before-shape for audit AND defend against a stale client.
 *   2. Rejects illegal transitions (e.g. paid → cancelled) with a typed
 *      result rather than a thrown error — the page can surface a
 *      friendly message.
 *   3. Stamps the matching timestamp (paid_at / cancelled_at /
 *      refunded_at) atomically with the status flip.
 *
 * Callers are responsible for writing the audit_logs row + revalidating
 * cache tags. We keep the data layer pure.
 */

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  paid_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  total_inr: number;
  customer_name: string;
  customer_email: string;
}

export type StatusFlipError =
  | { code: "not_found" }
  | { code: "illegal_transition"; from: OrderStatus; to: OrderStatus };

export type StatusFlipResult<TAfter = OrderRow> =
  | { ok: true; before: OrderRow; after: TAfter }
  | { ok: false; error: StatusFlipError };

const SELECT_COLS =
  "id, order_number, status, paid_at, cancelled_at, refunded_at, total_inr, customer_name, customer_email";

async function readOrder(supabase: SC, id: string): Promise<OrderRow | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(SELECT_COLS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`readOrder: ${error.message}`);
  return data ? (data as unknown as OrderRow) : null;
}

/** pending_payment → paid. Stamps paid_at = now(). */
export async function markOrderPaid(
  supabase: SC,
  id: string,
): Promise<StatusFlipResult> {
  const before = await readOrder(supabase, id);
  if (!before) return { ok: false, error: { code: "not_found" } };
  if (before.status !== "pending_payment") {
    return {
      ok: false,
      error: { code: "illegal_transition", from: before.status, to: "paid" },
    };
  }
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_payment") // guard against concurrent flips
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`markOrderPaid: ${error.message}`);
  return { ok: true, before, after: data as unknown as OrderRow };
}

/** pending_payment → cancelled. Stamps cancelled_at = now(). */
export async function markOrderCancelled(
  supabase: SC,
  id: string,
): Promise<StatusFlipResult> {
  const before = await readOrder(supabase, id);
  if (!before) return { ok: false, error: { code: "not_found" } };
  if (before.status !== "pending_payment") {
    return {
      ok: false,
      error: {
        code: "illegal_transition",
        from: before.status,
        to: "cancelled",
      },
    };
  }
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_payment")
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`markOrderCancelled: ${error.message}`);
  return { ok: true, before, after: data as unknown as OrderRow };
}

/** paid → refunded. Stamps refunded_at = now(). */
export async function markOrderRefunded(
  supabase: SC,
  id: string,
): Promise<StatusFlipResult> {
  const before = await readOrder(supabase, id);
  if (!before) return { ok: false, error: { code: "not_found" } };
  if (before.status !== "paid") {
    return {
      ok: false,
      error: { code: "illegal_transition", from: before.status, to: "refunded" },
    };
  }
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "paid")
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`markOrderRefunded: ${error.message}`);
  return { ok: true, before, after: data as unknown as OrderRow };
}
