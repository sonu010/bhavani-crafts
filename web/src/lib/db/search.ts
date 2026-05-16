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

  // Fetch synonyms for the tokens we actually have.
  const { data: synonymRows, error: synErr } = await supabase
    .from("search_synonyms")
    .select("term, synonyms")
    .in("term", tokens);
  if (synErr) {
    throw new Error(`search_synonyms lookup failed: ${synErr.message}`);
  }
  const synonymMap = new Map<string, string[]>();
  for (const row of (synonymRows ?? []) as Array<{
    term: string;
    synonyms: string[];
  }>) {
    synonymMap.set(row.term, row.synonyms);
  }

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
