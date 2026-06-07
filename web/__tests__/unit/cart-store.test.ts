/**
 * Unit tests for the storefront cart store (lib/storefront/cart-store.ts).
 *
 * Pure-logic regression coverage — no DB, no React, no localStorage.
 * Zustand's `create` lets us read/write the store directly without a
 * Provider; we test the actions + selectors against the resulting
 * state. The `persist` middleware is a no-op when window is undefined
 * (vitest's node env), so the store behaves like a plain in-memory
 * Zustand store here — exactly the surface we want to pin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub localStorage so the persist middleware doesn't blow up under
// node. The persist `getStorage()` default tries to read window.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// Import AFTER stubGlobal so the store sees a working localStorage at
// construction time.
import {
  useCartStore,
  selectSubtotalInr,
  selectTotalItems,
  type AddLineInput,
} from "@/lib/storefront/cart-store";

function freshLine(over?: Partial<AddLineInput>): AddLineInput {
  return {
    productId: "p-1",
    slug: "thing",
    name: "A thing",
    imageUrl: null,
    variantId: null,
    variantSku: null,
    variantLabel: null,
    unitPriceInr: 100,
    ...over,
  };
}

beforeEach(() => {
  // Each test starts from a clean cart. We can't `setState` from
  // outside in a strict-mode Zustand, but the store's `clear` action
  // is the official reset.
  useCartStore.getState().clear();
  useCartStore.setState({ isOpen: false });
});

describe("cart-store — addLine", () => {
  it("adds a new line with quantity 1 when none specified", () => {
    useCartStore.getState().addLine(freshLine());
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe("p-1");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].key).toBe("p-1"); // variantId is null → falls back to productId
  });

  it("clamps quantity to ≥ 1 even when caller passes 0 or negative", () => {
    useCartStore.getState().addLine(freshLine({ quantity: 0 }));
    useCartStore.getState().addLine(freshLine({ productId: "p-2", quantity: -5 }));
    const lines = useCartStore.getState().lines;
    expect(lines.find((l) => l.productId === "p-1")?.quantity).toBe(1);
    expect(lines.find((l) => l.productId === "p-2")?.quantity).toBe(1);
  });

  it("floors fractional quantities (no qty=1.7 in the cart)", () => {
    useCartStore.getState().addLine(freshLine({ quantity: 2.7 }));
    expect(useCartStore.getState().lines[0].quantity).toBe(2);
  });

  it("merges quantity when the same key is added again", () => {
    useCartStore.getState().addLine(freshLine({ quantity: 2 }));
    useCartStore.getState().addLine(freshLine({ quantity: 3 }));
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  it("keeps two distinct lines for two variants of the same product", () => {
    useCartStore.getState().addLine(
      freshLine({ variantId: "v-A", variantSku: "P1-A", variantLabel: "Small" }),
    );
    useCartStore.getState().addLine(
      freshLine({ variantId: "v-B", variantSku: "P1-B", variantLabel: "Large" }),
    );
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(2);
    expect(lines[0].key).toBe("v-A");
    expect(lines[1].key).toBe("v-B");
  });

  it("addLine variant + addLine non-variant of same productId are DISTINCT lines (variantId NULL falls back to productId)", () => {
    // Variant A keyed on "v-A", non-variant keyed on productId "p-1".
    // These don't collide.
    useCartStore.getState().addLine(freshLine({ variantId: "v-A" }));
    useCartStore.getState().addLine(freshLine());
    expect(useCartStore.getState().lines.map((l) => l.key)).toEqual([
      "v-A",
      "p-1",
    ]);
  });
});

describe("cart-store — removeLine", () => {
  it("drops the matching line by key", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().addLine(freshLine({ productId: "p-2" }));
    useCartStore.getState().removeLine("p-1");
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe("p-2");
  });

  it("is a no-op for an unknown key", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().removeLine("nope");
    expect(useCartStore.getState().lines).toHaveLength(1);
  });
});

describe("cart-store — setQuantity", () => {
  it("sets the quantity directly", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().setQuantity("p-1", 7);
    expect(useCartStore.getState().lines[0].quantity).toBe(7);
  });

  it("floors fractional values", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().setQuantity("p-1", 3.9);
    expect(useCartStore.getState().lines[0].quantity).toBe(3);
  });

  it("removes the line when set to 0 or below", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().setQuantity("p-1", 0);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("removes the line when set to negative", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().setQuantity("p-1", -10);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("is a no-op for an unknown key (doesn't add a phantom line)", () => {
    useCartStore.getState().setQuantity("nope", 5);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});

describe("cart-store — clear", () => {
  it("empties the cart", () => {
    useCartStore.getState().addLine(freshLine());
    useCartStore.getState().addLine(freshLine({ productId: "p-2" }));
    useCartStore.getState().clear();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("doesn't touch isOpen", () => {
    useCartStore.getState().openCart();
    useCartStore.getState().clear();
    expect(useCartStore.getState().isOpen).toBe(true);
  });
});

describe("cart-store — drawer actions", () => {
  it("openCart / closeCart / toggleCart flip isOpen correctly", () => {
    expect(useCartStore.getState().isOpen).toBe(false);
    useCartStore.getState().openCart();
    expect(useCartStore.getState().isOpen).toBe(true);
    useCartStore.getState().closeCart();
    expect(useCartStore.getState().isOpen).toBe(false);
    useCartStore.getState().toggleCart();
    expect(useCartStore.getState().isOpen).toBe(true);
    useCartStore.getState().toggleCart();
    expect(useCartStore.getState().isOpen).toBe(false);
  });
});

describe("cart-store — selectors", () => {
  it("selectTotalItems sums quantities across lines", () => {
    useCartStore.getState().addLine(freshLine({ quantity: 2 }));
    useCartStore.getState().addLine(freshLine({ productId: "p-2", quantity: 3 }));
    expect(selectTotalItems(useCartStore.getState())).toBe(5);
  });

  it("selectTotalItems is 0 on an empty cart", () => {
    expect(selectTotalItems(useCartStore.getState())).toBe(0);
  });

  it("selectSubtotalInr sums unitPriceInr × quantity", () => {
    useCartStore.getState().addLine(
      freshLine({ unitPriceInr: 100, quantity: 2 }),
    );
    useCartStore.getState().addLine(
      freshLine({ productId: "p-2", unitPriceInr: 250, quantity: 3 }),
    );
    expect(selectSubtotalInr(useCartStore.getState())).toBe(950); // 200 + 750
  });

  it("selectSubtotalInr is 0 on an empty cart", () => {
    expect(selectSubtotalInr(useCartStore.getState())).toBe(0);
  });
});
