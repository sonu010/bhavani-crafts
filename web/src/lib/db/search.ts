/**
 * Search products via FTS + trigram + synonym expansion.
 *
 * Pipeline (per architecture/search.md):
 *   1. Tokenize user query (lowercase, strip non-alphanum).
 *   2. Look up each token in search_synonyms; expand to all synonyms.
 *   3. Build a tsquery from the expanded set: words OR'd, exact words AND'd
 *      with their synonyms.
 *   4. Postgres FTS via Supabase's `.textSearch()`.
 *
 * Trigram is NOT used in the WHERE clause here — see architecture/search.md
 * §"Trigram threshold". The known issue (similarity threshold too strict
 * for long names) is parked for P3-T18/T19. For now this function does
 * exact-word + synonym matching only.
 *
 * Caller is responsible for the search_logs insert (via service-role,
 * waitUntil) — we don't do it here because the anon client can't.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import {
  ProductListItemSchema,
  type ProductListItem,
} from "@/lib/schemas/product";

type SC = SupabaseClient<Database>;

export interface SearchProductsOpts {
  limit?: number;
}

export interface SearchResult {
  query: string;
  expanded: string;
  items: ProductListItem[];
}

/**
 * Tokenize a user-supplied query string into lowercase, alphanumeric
 * tokens. Punctuation is stripped, multi-spaces collapsed.
 */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Build a Postgres tsquery string from tokens + their synonym expansions.
 *
 * Synonym entries can be multi-word (e.g. "epoxy resin"). Postgres tsquery
 * does not accept space-separated words inside an OR group — they must be
 * AND'd explicitly. So a multi-word synonym becomes a parenthesized AND
 * expression. Single-word synonyms stay as bare lexemes.
 *
 * Example:
 *   tokens = ["resin", "clear"]
 *   synonyms.get("resin") = ["epoxy", "epoxy resin"]
 *   → "(resin | epoxy | (epoxy & resin)) & clear"
 */
export function buildTsquery(
  tokens: string[],
  synonyms: Map<string, string[]>,
): string {
  if (tokens.length === 0) return "";

  const cleanWord = (w: string) =>
    w.toLowerCase().replace(/[^a-z0-9]+/g, "");

  const phraseToTsquery = (phrase: string): string | null => {
    const words = phrase.split(/\s+/).map(cleanWord).filter(Boolean);
    if (words.length === 0) return null;
    if (words.length === 1) return words[0];
    return `(${words.join(" & ")})`;
  };

  return tokens
    .map((t) => {
      const expansions = synonyms.get(t);
      const all = expansions ? [t, ...expansions] : [t];
      const groups = Array.from(
        new Set(all.map(phraseToTsquery).filter((g): g is string => g !== null)),
      );
      if (groups.length === 0) return null;
      if (groups.length === 1) return groups[0];
      return `(${groups.join(" | ")})`;
    })
    .filter((g): g is string => g !== null)
    .join(" & ");
}

/**
 * Look up synonyms for the given tokens, bidirectionally.
 *
 * search_synonyms rows are equivalence groups: `term` plus every entry
 * in `synonyms` are all interchangeable. The schema seeded canonical →
 * variant only (e.g. term="mould", synonyms=["mold", "molds", "moulds"]),
 * so a token-on-`term` lookup misses queries that use a variant ("mold"
 * → no row found).
 *
 * Fix: query both directions. `.in('term', tokens)` catches canonical
 * matches; `.overlaps('synonyms', tokens)` catches variant matches.
 * Merge the rows and, for each token-matching lexeme, map it to the
 * other members of its equivalence group.
 *
 * Returns Map<token, otherLexemes[]>. buildTsquery consumes this shape.
 */
export async function fetchSynonyms(
  supabase: SC,
  tokens: string[],
): Promise<Map<string, string[]>> {
  if (tokens.length === 0) return new Map();

  const [forward, reverse] = await Promise.all([
    supabase.from("search_synonyms").select("term, synonyms").in("term", tokens),
    supabase
      .from("search_synonyms")
      .select("term, synonyms")
      .overlaps("synonyms", tokens),
  ]);
  if (forward.error) throw new Error(`search_synonyms (forward): ${forward.error.message}`);
  if (reverse.error) throw new Error(`search_synonyms (reverse): ${reverse.error.message}`);

  // Dedupe rows; `term` is the unique key on the table.
  const seen = new Set<string>();
  const groups: Array<{ term: string; synonyms: string[] }> = [];
  for (const row of [...(forward.data ?? []), ...(reverse.data ?? [])] as Array<{
    term: string;
    synonyms: string[];
  }>) {
    if (seen.has(row.term)) continue;
    seen.add(row.term);
    groups.push(row);
  }

  const map = new Map<string, string[]>();
  const tokenSet = new Set(tokens);
  for (const { term, synonyms } of groups) {
    const lexemes = [term, ...(synonyms ?? [])];
    for (const lex of lexemes) {
      if (!tokenSet.has(lex)) continue;
      const others = lexemes.filter((x) => x !== lex);
      const existing = map.get(lex) ?? [];
      map.set(lex, [...new Set([...existing, ...others])]);
    }
  }
  return map;
}

export async function searchProducts(
  supabase: SC,
  query: string,
  opts: SearchProductsOpts = {},
): Promise<SearchResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? 24), 100);
  const tokens = tokenize(query);

  if (tokens.length === 0) {
    return { query, expanded: "", items: [] };
  }

  const synonymMap = await fetchSynonyms(supabase, tokens);

  const expanded = buildTsquery(tokens, synonymMap);
  if (!expanded) {
    return { query, expanded: "", items: [] };
  }

  // Postgres FTS. We use `textSearch` with `config: english` to match the
  // generated `fts` column's tokenizer config in 0005_search.sql.
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, slug, name, short_description, base_price_inr, compare_at_price_inr, stock_status, is_featured, created_at",
    )
    .is("deleted_at", null)
    .textSearch("fts", expanded, { config: "english" })
    .limit(limit);
  if (error) {
    throw new Error(`searchProducts FTS failed: ${error.message}`);
  }

  const items = ProductListItemSchema.array().parse(data ?? []);
  return { query, expanded, items };
}
