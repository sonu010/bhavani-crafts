/**
 * Integration tests for Trash data layer (P2-T28).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  getTrashCounts,
  hardDeleteEntity,
  listTrashed,
  restoreEntity,
} from "@/lib/db/admin/trash";
import { srv } from "../_clients";

const tagIds: string[] = [];

afterAll(async () => {
  if (tagIds.length > 0) {
    await srv.from("tags").delete().in("id", tagIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeSoftDeletedTag(name: string) {
  const ins = await srv
    .from("tags")
    .insert({
      name,
      slug: `zzz-trash-${rid()}`,
      deleted_at: new Date().toISOString(),
    })
    .select("id, name, slug, deleted_at")
    .single();
  if (ins.error) throw ins.error;
  tagIds.push(ins.data.id);
  return ins.data;
}

describe("listTrashed", () => {
  it("returns soft-deleted tags only", async () => {
    const t = await makeSoftDeletedTag(`zzz trash list ${rid()}`);
    const { rows, total } = await listTrashed(srv, "tags");
    expect(total).toBeGreaterThan(0);
    expect(rows.find((r) => r.id === t.id)).toBeDefined();
  });

  it("normalises shape to TrashedRow", async () => {
    const t = await makeSoftDeletedTag(`zzz shape ${rid()}`);
    const { rows } = await listTrashed(srv, "tags");
    const row = rows.find((r) => r.id === t.id);
    expect(row?.label).toBe(t.name);
    expect(row?.sublabel).toBe(t.slug);
    expect(row?.deleted_at).toBe(t.deleted_at);
  });
});

describe("getTrashCounts", () => {
  it("returns a number per entity type", async () => {
    const counts = await getTrashCounts(srv);
    for (const v of Object.values(counts)) {
      expect(typeof v).toBe("number");
    }
  });
});

describe("restoreEntity", () => {
  it("clears deleted_at on a tag", async () => {
    const t = await makeSoftDeletedTag(`zzz restore ${rid()}`);
    const r = await restoreEntity(srv, "tags", t.id);
    expect(r.ok).toBe(true);

    const after = await srv
      .from("tags")
      .select("deleted_at")
      .eq("id", t.id)
      .single();
    expect(after.data?.deleted_at).toBeNull();
  });

  it("refuses to restore a row that isn't soft-deleted", async () => {
    const live = await srv
      .from("tags")
      .insert({ name: `zzz live ${rid()}`, slug: `zzz-live-${rid()}` })
      .select("id")
      .single();
    if (live.error) throw live.error;
    tagIds.push(live.data.id);
    const r = await restoreEntity(srv, "tags", live.data.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_deleted");
  });

  it("returns not_found for unknown id", async () => {
    const r = await restoreEntity(
      srv,
      "tags",
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});

describe("hardDeleteEntity", () => {
  it("permanently deletes a soft-deleted tag + returns snapshot", async () => {
    const t = await makeSoftDeletedTag(`zzz hd ${rid()}`);
    const r = await hardDeleteEntity(srv, "tags", t.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = r.result.beforeRow as { id: string; name: string };
      expect(row.id).toBe(t.id);
      expect(r.result.label).toBe(t.name);
    }
    // Pop from cleanup list since the row is gone.
    const idx = tagIds.indexOf(t.id);
    if (idx >= 0) tagIds.splice(idx, 1);

    const after = await srv
      .from("tags")
      .select("id")
      .eq("id", t.id)
      .maybeSingle();
    expect(after.data).toBeNull();
  });

  it("refuses to hard-delete a live row (not in Trash)", async () => {
    const live = await srv
      .from("tags")
      .insert({ name: `zzz hd-live ${rid()}`, slug: `zzz-hd-live-${rid()}` })
      .select("id")
      .single();
    if (live.error) throw live.error;
    tagIds.push(live.data.id);
    const r = await hardDeleteEntity(srv, "tags", live.data.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_deleted");
  });
});
