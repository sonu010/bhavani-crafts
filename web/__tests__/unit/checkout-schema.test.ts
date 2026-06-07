/**
 * Unit tests for the Zod schemas in lib/schemas/checkout.ts.
 *
 * The schemas are the front line of trust for the checkout server
 * action: malformed input is rejected here before it hits the
 * catalog read or the create-order RPC. The validators have to:
 *   - Reject obviously bad emails / phones / PIN codes with friendly
 *     messages
 *   - Reject quantity ≤ 0 or > 999
 *   - Strip out empty optional strings (line2, landmark, notes,
 *     variantLabel)
 *   - Cap string lengths so a giant name can't blow past the DB's
 *     CHECK constraints
 *
 * Pure-string tests — no DB.
 */
import { describe, expect, it } from "vitest";
import {
  CheckoutCartLineSchema,
  CreateCheckoutOrderInputSchema,
  CustomerInfoSchema,
  ShippingAddressSchema,
} from "@/lib/schemas/checkout";

const GOOD_CUSTOMER = {
  name: "Alice Wonderland",
  email: "alice@example.com",
  phone: "+91 9876543210",
};

const GOOD_SHIPPING = {
  line1: "12 Main Street",
  city: "Hyderabad",
  state: "TG",
  pin: "500001",
  country: "IN" as const,
};

const GOOD_LINE = {
  productId: "11111111-1111-4111-8111-111111111111",
  variantId: null,
  sku: "BC-DIYA-S",
  name: "Brass Diya",
  variantLabel: null,
  unitPriceInr: 250,
  quantity: 1,
};

describe("CustomerInfoSchema", () => {
  it("accepts a well-formed customer", () => {
    const r = CustomerInfoSchema.safeParse(GOOD_CUSTOMER);
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = CustomerInfoSchema.safeParse({ ...GOOD_CUSTOMER, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a name over 120 chars", () => {
    const r = CustomerInfoSchema.safeParse({
      ...GOOD_CUSTOMER,
      name: "x".repeat(121),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an email without an @", () => {
    const r = CustomerInfoSchema.safeParse({
      ...GOOD_CUSTOMER,
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a phone with letters", () => {
    const r = CustomerInfoSchema.safeParse({
      ...GOOD_CUSTOMER,
      phone: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a phone with spaces / hyphens / + prefix (real-world input)", () => {
    for (const phone of ["+91 9876543210", "+91-987-654-3210", "(987) 6543210"]) {
      const r = CustomerInfoSchema.safeParse({ ...GOOD_CUSTOMER, phone });
      expect(r.success).toBe(true);
    }
  });
});

describe("ShippingAddressSchema", () => {
  it("accepts a well-formed Indian address", () => {
    const r = ShippingAddressSchema.safeParse(GOOD_SHIPPING);
    expect(r.success).toBe(true);
  });

  it("rejects a PIN that starts with 0", () => {
    const r = ShippingAddressSchema.safeParse({
      ...GOOD_SHIPPING,
      pin: "012345",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a 5-digit PIN", () => {
    const r = ShippingAddressSchema.safeParse({
      ...GOOD_SHIPPING,
      pin: "50001",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a PIN with non-digits", () => {
    const r = ShippingAddressSchema.safeParse({
      ...GOOD_SHIPPING,
      pin: "5000AB",
    });
    expect(r.success).toBe(false);
  });

  it("defaults country to IN when omitted", () => {
    const { country: _drop, ...rest } = GOOD_SHIPPING;
    void _drop;
    const r = ShippingAddressSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.country).toBe("IN");
  });

  it("accepts an empty string for optional fields (line2, landmark)", () => {
    const r = ShippingAddressSchema.safeParse({
      ...GOOD_SHIPPING,
      line2: "",
      landmark: "",
    });
    expect(r.success).toBe(true);
  });

  it("rejects line1 over 120 chars", () => {
    const r = ShippingAddressSchema.safeParse({
      ...GOOD_SHIPPING,
      line1: "x".repeat(121),
    });
    expect(r.success).toBe(false);
  });
});

describe("CheckoutCartLineSchema", () => {
  it("accepts a well-formed line", () => {
    const r = CheckoutCartLineSchema.safeParse(GOOD_LINE);
    expect(r.success).toBe(true);
  });

  it("rejects quantity = 0", () => {
    const r = CheckoutCartLineSchema.safeParse({ ...GOOD_LINE, quantity: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects quantity > 999 (matches DB CHECK)", () => {
    const r = CheckoutCartLineSchema.safeParse({ ...GOOD_LINE, quantity: 1000 });
    expect(r.success).toBe(false);
  });

  it("rejects negative unitPriceInr", () => {
    const r = CheckoutCartLineSchema.safeParse({
      ...GOOD_LINE,
      unitPriceInr: -1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-uuid productId", () => {
    const r = CheckoutCartLineSchema.safeParse({
      ...GOOD_LINE,
      productId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  it("accepts variantId as null OR a uuid", () => {
    expect(
      CheckoutCartLineSchema.safeParse({ ...GOOD_LINE, variantId: null }).success,
    ).toBe(true);
    expect(
      CheckoutCartLineSchema.safeParse({
        ...GOOD_LINE,
        variantId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(true);
  });
});

describe("CreateCheckoutOrderInputSchema (top-level)", () => {
  const GOOD_TOP = {
    customer: GOOD_CUSTOMER,
    shipping: GOOD_SHIPPING,
    lines: [GOOD_LINE],
  };

  it("accepts a well-formed order", () => {
    const r = CreateCheckoutOrderInputSchema.safeParse(GOOD_TOP);
    expect(r.success).toBe(true);
  });

  it("rejects an empty lines array (no items = no order)", () => {
    const r = CreateCheckoutOrderInputSchema.safeParse({
      ...GOOD_TOP,
      lines: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects > 50 lines (we don't ship pallets via the storefront)", () => {
    // Build 51 distinct, RFC-valid v4 UUIDs (version nibble must be 4,
    // variant nibble in 8/9/a/b).
    const lines = Array.from({ length: 51 }, (_, i) => ({
      ...GOOD_LINE,
      productId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
    }));
    const r = CreateCheckoutOrderInputSchema.safeParse({ ...GOOD_TOP, lines });
    expect(r.success).toBe(false);
  });

  it("accepts a notes string at the 500-char cap", () => {
    const r = CreateCheckoutOrderInputSchema.safeParse({
      ...GOOD_TOP,
      notes: "x".repeat(500),
    });
    expect(r.success).toBe(true);
  });

  it("rejects notes over 500 chars (DB CHECK would also reject)", () => {
    const r = CreateCheckoutOrderInputSchema.safeParse({
      ...GOOD_TOP,
      notes: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it("propagates customer-level errors to the top-level result", () => {
    const r = CreateCheckoutOrderInputSchema.safeParse({
      ...GOOD_TOP,
      customer: { ...GOOD_CUSTOMER, email: "broken" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      // The first issue path traces into customer.email.
      const path = r.error.issues[0]?.path.join(".");
      expect(path).toMatch(/^customer\.email/);
    }
  });
});
