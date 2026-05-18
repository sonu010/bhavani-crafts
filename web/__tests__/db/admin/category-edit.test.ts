/**
 * Integration tests for category create + update (P2-T19).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  createCategory,
  getCategoryForEditing,
  updateCategory,
} from "@/lib/db/admin/categories";
import { srv } from "../_clients";

const cleanupIds: string[] = [];

afterAll(async () => {
  if (cleanupIds.length > 0) {
    await srv.from("categories").delete().in("id", cleanupIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function baseInput(name = "zzz fix") {
  const slug = `zzz-fix-edit-${rid()}`;
  return {
    name,
    slug,
    description: null,
    parent_id: null,
    sort_order: 0,
    image_url: null,
    meta_title: null,
    meta_description: null,
  };
}

describe("createCategory", () => {
  it("creates a top-level category", async () => {
    const r = await createCategory(srv, baseInput("zzz one"));
    expect(r.ok).toBe(true);
    if (r.ok) cleanupIds.push(r.id);
  });

  it("rejects slug collision", async () => {
    const input = baseInput("zzz dup");
    const a = await createCategory(srv, input);
    expect(a.ok).toBe(true);
    if (a.ok) cleanupIds.push(a.id);
    const b = await createCategory(srv, input);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("slug_in_use");
  });

  it("rejects malformed slug as validation", async () => {
    const r = await createCategory(srv, {
      ...baseInput("zzz bad"),
      slug: "Bad Slug With CAPS!",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });

  it("rejects missing parent reference", async () => {
    const r = await createCategory(srv, {
      ...baseInput("zzz mp"),
      parent_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "invalid_parent") {
      expect(r.error.reason).toBe("missing");
    }
  });
});

describe("updateCategory", () => {
  it("updates name + slug", async () => {
    const a = await createCategory(srv, baseInput("zzz upd-1"));
    if (!a.ok) throw new Error("setup");
    cleanupIds.push(a.id);
    const r = await updateCategory(srv, a.id, {
      ...baseInput("zzz renamed"),
      slug: `zzz-renamed-${rid()}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.after.name).toBe("zzz renamed");
      expect(r.after.slug).toMatch(/^zzz-renamed-/);
    }
  });

  it("rejects self as parent", async () => {
    const a = await createCategory(srv, baseInput("zzz self"));
    if (!a.ok) throw new Error("setup");
    cleanupIds.push(a.id);

    const current = await getCategoryForEditing(srv, a.id);
    expect(current).not.toBeNull();
    const r = await updateCategory(srv, a.id, {
      ...current!,
      parent_id: a.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "invalid_parent") {
      expect(r.error.reason).toBe("self");
    }
  });

  it("rejects descendant as parent (cycle)", async () => {
    const top = await createCategory(srv, baseInput("zzz top"));
    if (!top.ok) throw new Error("setup");
    cleanupIds.push(top.id);
    const child = await createCategory(srv, {
      ...baseInput("zzz child"),
      parent_id: top.id,
    });
    if (!child.ok) throw new Error("setup");
    cleanupIds.push(child.id);

    const topRow = await getCategoryForEditing(srv, top.id);
    const r = await updateCategory(srv, top.id, {
      ...topRow!,
      parent_id: child.id, // making child the parent of top → cycle
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "invalid_parent") {
      expect(r.error.reason).toBe("descendant");
    }
  });
});
