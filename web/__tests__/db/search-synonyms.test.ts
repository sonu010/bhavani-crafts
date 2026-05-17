/**
 * Pins the bidirectional behavior of fetchSynonyms (lib/db/search.ts).
 *
 * search_synonyms rows are equivalence groups. Before the fix, the lookup
 * only matched `term IN tokens` — so the canonical → variant direction
 * worked ("mould" → mold/molds/moulds) but the variant → canonical
 * direction didn't ("mold" → no expansion). This test pins both.
 *
 * Seeds in 0005_search.sql include rows like:
 *   term="mould",  synonyms=["mold","molds","moulds"]
 *   term="colour", synonyms=["color","colors","colours"]
 *
 * We use those rows (already in the live DB) rather than seeding our own,
 * to also catch regressions in the seed data.
 */
import { describe, expect, it } from "vitest";
import { fetchSynonyms } from "@/lib/db/search";
import { srv } from "./_clients";

describe("fetchSynonyms", () => {
  it("forward lookup: canonical term in tokens → expands to variants", async () => {
    const map = await fetchSynonyms(srv, ["mould"]);
    const expansions = map.get("mould") ?? [];
    expect(expansions).toEqual(expect.arrayContaining(["mold", "molds", "moulds"]));
    expect(expansions).not.toContain("mould"); // self excluded
  });

  it("reverse lookup: variant in tokens → expands to canonical + sibling variants", async () => {
    const map = await fetchSynonyms(srv, ["mold"]);
    const expansions = map.get("mold") ?? [];
    expect(expansions).toEqual(expect.arrayContaining(["mould", "molds", "moulds"]));
    expect(expansions).not.toContain("mold");
  });

  it("mixed forward + reverse in one query", async () => {
    const map = await fetchSynonyms(srv, ["mould", "color"]);
    const moldGroup = map.get("mould") ?? [];
    const colorGroup = map.get("color") ?? [];
    expect(moldGroup).toEqual(expect.arrayContaining(["mold", "molds", "moulds"]));
    expect(colorGroup).toEqual(expect.arrayContaining(["colour", "colors", "colours"]));
  });

  it("token with no synonym row → not in the map", async () => {
    const map = await fetchSynonyms(srv, [`zzz-no-such-token-${Math.random().toString(36).slice(2, 8)}`]);
    expect(map.size).toBe(0);
  });

  it("empty tokens → empty map", async () => {
    const map = await fetchSynonyms(srv, []);
    expect(map.size).toBe(0);
  });
});
