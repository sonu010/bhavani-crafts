# AI workflow — rules for AI-assisted coding + AI features

This file has two parts:

- **Part A: Rules for AI agents writing code in this repo.** Read before doing any task.
- **Part B: AI features inside the product.** How Claude is integrated for admin assistance (Phase 4).

---

## Part A. Rules for AI-assisted coding

### A1. One task at a time

- Read `plans.md`, find the next `not_started` task whose `depends_on` are `done`, start that one.
- Each task file is ≤ 200 lines. Do not load the whole plan into context. Read only the task + files in its **Prerequisites** section.

### A2. Mandatory status updates

- On start: edit the task's frontmatter `status: in_progress`. Bump `plans.md` (⬜ → 🟡). Bump `progress.md`.
- On finish: edit `status: done`, set `last_updated`. Bump `plans.md` (🟡 → ✅). Bump `progress.md`. Write "Notes for next agent."

### A3. Forbidden moves

- **Never** retroactively edit `web/supabase/migrations/0001_init.sql` (or any merged migration). Schema changes go in a new migration file.
- **Never** bypass RLS or skip the `requireRole('admin')` server-side check.
- **Never** commit secrets. The pre-commit hook blocks `*.env*`. Don't disable the hook.
- **Never** invent customer-facing copy (testimonials, store details, prices). Placeholders are flagged `TODO(copy):`.
- **Never** add a dependency without listing it in the task's "Dependencies added" section with a one-line justification.
- **Never** auto-publish AI-generated content. Every AI suggestion lands in `ai_generations` with `status='proposed'` and waits for an admin accept.
- **Never** use `// @ts-ignore`, `// @ts-expect-error`, or `eslint-disable` without an inline comment explaining why.
- **Never** mock the database in tests that exercise RLS or migrations. Tests against RLS use a real Supabase instance (CI provisions one).

### A4. Migration discipline

- New migrations live in `web/supabase/migrations/<NNNN>_<short_name>.sql`.
- First line of every migration: `-- rollback: <one-line description of how to undo>`.
- Migrations are applied via `supabase db push`. Never edit production schema manually except via runbook (`runbooks/add-new-migration.md`).
- After every schema change, regenerate types: `supabase gen types typescript > web/src/lib/db/types.gen.ts`.

### A5. Tests

- Every new feature includes at least one test (Vitest for unit/component, Playwright for E2E flows touched, SQL assertion for migrations).
- Tests run pre-commit (changed-files only) and in CI (all). PRs cannot merge red.

### A6. Mobile pass

- Every UI task ends with a visual check at 360px viewport. Note any issues in "Notes for next agent."

### A7. Documentation lives next to code

- Every server action has a JSDoc with a "Side effects" line listing the tables it writes and the revalidations it triggers.
- New env vars are documented in `web/.env.example` with a comment.

### A8. Commit hygiene

- Commit messages: `<phase-task-id>: <imperative summary>` — e.g. `P2-T13: add product attributes editor`.
- One task per commit when possible. Squash multiple WIP commits before merging.
- Never amend a merged commit. Never force-push to `main`.

---

## Part B. AI features inside the product

Provider: **Anthropic Claude.** Haiku for classification/tagging, Sonnet for drafting. Prompts versioned in `web/src/lib/ai/prompts/*.ts`.

All AI features are **assistive, not autonomous.** Admin reviews and accepts before anything reaches the storefront.

### B1. Tasks (Phase 4)

| Task | Model | Trigger | Output |
|---|---|---|---|
| `category_suggest` | Haiku | Product create / edit / import row | `{primary_category_slug, confidence, alternatives[≤3], reasoning}` |
| `tag_suggest` | Haiku | Same | `{tags[≤8]}` |
| `alt_text` | Haiku (vision) | Image upload | `{alt}` |
| `description_draft` | Sonnet | Admin clicks "Draft from name + attributes" | `{description_markdown, warnings[]}` |
| `duplicate_detect` | Haiku | CSV import row | `{is_likely_duplicate, duplicate_of_sku, confidence}` |
| `csv_cleanup` | Haiku | CSV import preview | `{normalized_categories: {raw → canonical}, ...}` |
| `search_synonym_mine` | Haiku | Nightly cron | `{candidates: [{term, synonyms[]}]}` |

### B2. Cost controls

| Control | Default | Where |
|---|---|---|
| Monthly cap | $20 USD (env `AI_MONTHLY_USD_BUDGET`) | client refuses at 90% of cap |
| Per-task budget | Haiku 2k in / 1k out · Sonnet 4k in / 2k out | `max_tokens` + input truncation |
| Per-user rate limit | 30 calls / 10 min | Upstash counter |
| Org daily limit | 500 calls / day | same counter |
| Model routing | Haiku by default; Sonnet only on regenerate / drafting tasks / 2nd-attempt fallback | `selectModel(task, attempt)` |
| Batching | Bulk import: 20 products per Anthropic call | `batchSuggest()` helper |
| Cache | Identical `input_hash` within 24h returns the cached `output_json` | `ai_generations` lookup first |

### B3. Prompt-injection defense

User-controlled content (scraped names, CSV cells, admin-typed strings, OCR text) is **hostile data**. Defenses:

- **Strict role separation.** System prompt is owned by us, versioned, never concatenated with user input. User content goes only in `user` role, always wrapped in delimiters (`<product_name>...</product_name>`, `<csv_row>...</csv_row>`).
- **No tool / function calling** in assistive features. AI returns structured text only.
- **Output sandboxing.** Never eval, never SQL fragment, never raw HTML render, never URL without scheme check.
- **Pattern strip** (weak signal, tripwire): strip `</system>`, `<|im_end|>`, "Ignore previous instructions" before sending.
- **Length caps:** truncate each product description to 4,000 chars; refuse calls if untrusted portion > 80% of input budget.
- **Secret isolation:** AI client process loads only `ANTHROPIC_API_KEY`, never the service-role key.
- **Output never auto-applies.** Every suggestion is `proposed` until an admin accepts.

### B4. Zod validation + semantic checks

Every task has a Zod schema in `web/src/lib/ai/schemas.ts`. Output is parsed before storage. Examples:

```ts
export const CategorySuggestionSchema = z.object({
  primary_category_slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(3),
  reasoning: z.string().max(280),
});
```

Wrapper:

```ts
async function generate<T>(opts: { task, prompt, schema }) {
  const raw = await callAnthropic(...);
  const parsed = opts.schema.safeParse(extractJson(raw));
  if (!parsed.success) {
    await logRejection(opts.task, parsed.error);
    return { status: 'rejected' };
  }
  // semantic checks per task
  return { status: 'ok', data: parsed.data };
}
```

**Semantic checks** on top of Zod:
- `primary_category_slug` must exist in `categories` table.
- `tags` must each match slug pattern + not be on a small profanity blocklist.
- `description_markdown` is run through `rehype-sanitize` before display preview.
- `alt` text must not equal the product name verbatim (lazy AI output) — reject.

On failure: log to `ai_generations` with `status='rejected'`; do not surface to admin; show "couldn't generate cleanly — try again or write manually."

Max 2 attempts per task per session.

### B5. Audit + reproducibility

Every call writes a row to `ai_generations`:
- `task_type`, `prompt_version`, `model`, `input_hash` (sha256), `input_tokens`, `output_tokens`, `usd_cost`
- `output_json`, `validation_status`, `validation_error`
- `status` (`proposed` / `accepted` / `rejected` / `semantic_fail`)
- `reviewed_by`, `reviewed_at` (when admin acts)

This lets us replay past suggestions, A/B test prompt versions, answer "why did the AI suggest X?"

### B6. Files

- `web/src/lib/ai/client.ts` — single entry point (lint rule blocks direct `Anthropic` imports elsewhere)
- `web/src/lib/ai/prompts/*.ts` — versioned prompts, one per task
- `web/src/lib/ai/schemas.ts` — Zod schemas
- `web/src/lib/ai/semantic-checks.ts` — per-task semantic validators
- `web/src/lib/ai/cost.ts` — token + USD accounting
- `web/src/lib/ai/cache.ts` — `input_hash` lookup
- `web/src/app/admin/ai-generations/page.tsx` — review queue + accept/reject UI
