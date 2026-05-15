# Engineering principles

Adopted 2026-05-15 from the owner's cross-project standard. These principles supersede earlier guidance where they conflict. AI agents read this **before** any code change.

The rest of `claude/architecture/*.md` describes **what** we build. This file describes **how** we build.

## Core philosophy

- Simple over abstract.
- One correct path, not many.
- Optimize for clarity, not backward compatibility.
- Fail fast when assumptions break.
- No defensive layers that hide bugs.
- Isolated, explicit responsibilities.
- Minimum moving parts.

## Decision rules

### 1. Simplicity first

Pick the smallest implementation that fully solves the problem. **Avoid:** premature abstraction, speculative config, generic frameworks for specific problems. **Prefer:** direct code, explicit behavior, small functions, predictable control flow.

### 2. No fallback logic

If the primary mechanism fails, throw and stop. No silent retries, no alternative branches, no auto-corrections. Surface the issue immediately; fix the root cause. Hidden recovery paths make systems harder to debug.

Exceptions are explicit and named:
- Diagnostic endpoints that report state may branch on error codes — but the branches are *exposed states*, not silent recoveries.
- Documented structural patterns (e.g. Next 16's cookie write semantics in Server Components) carry an inline comment explaining why the try/catch is required.

### 3. One clear way

For each problem: one approach, one data flow, one source of truth. If replacing an old approach, **remove the old implementation completely**. Do not preserve legacy patterns for convenience.

### 4. Clarity over compatibility

Readable code beats preserving old interfaces. Explicit APIs, strict typing, clear naming, obvious behavior. No compatibility shims, overloaded behavior, or ambiguous interfaces.

### 5. Fail fast

Validate assumptions immediately. When preconditions are violated: throw, stop, expose. Do not silently ignore, auto-correct, or continue in partially broken state.

### 6. No backup state

Trust the primary system of record. Avoid duplicated state, shadow copies, sync layers, cache-like fallbacks. Every extra state mechanism increases inconsistency risk.

Caveat for this project: `web/src/lib/db/types.gen.ts` is **not** duplicated state — it is the compile-time reflection of the schema, regenerated from Supabase. Until CI runs `supabase gen types`, we hand-edit it in lockstep with the migration that changes the schema.

### 7. Separation of concerns

One responsibility per module / function / component. Focused functions, composable modules, explicit boundaries. No multi-purpose utilities, no hidden side effects, no tight coupling.

## Development methodology

### Surgical changes only

The smallest effective change. Do not refactor unrelated code, restructure files unnecessarily, or introduce broad architectural shifts during bug fixes.

**This project, specifically:** use targeted `git add <paths>` not `git add -A`. The Sep-15 incident where `data/bhavani_crafts_inventory_checklist.csv` got swept into commit `a408e0f` was a violation. Don't repeat.

### Evidence-based debugging

Targeted logging, reproducible test cases, narrow instrumentation. Not speculative rewrites or blind refactors. Identify the cause before adding complexity.

### Fix root causes

Every fix names: why the issue occurred, what invariant was violated, which assumption failed. Then corrects the underlying problem. The two iterations on `0001_init.sql` (function-ordering bug, then smoke-data slug bug) both named the root cause in the commit message before fixing it — keep doing that.

### Compile-time guarantees

Use the type system. Strict types, exhaustive checks (`switch` on enums uses `never`-typed default branch), explicit contracts. Not runtime defensive guards for impossible states.

### Collaborative engineering

Iteratively: clarify constraints, challenge weak assumptions, identify the minimal correct solution, explain tradeoffs directly. **Do not default to agreement.** Stress-test ideas before implementation.

For every proposal — yours or mine — the primary question is:

> What is the weakest part of this approach?

If you propose a plan and I don't push back on anything, either I missed something or you're not proposing anything novel.

## Communication rules

- Direct and technically precise.
- No motivational language or exaggerated affirmation. No "Excellent!", "" without a reason, "Great question," etc.
- Don't agree automatically. If I disagree with a decision, I say so and explain why.
- Challenge assumptions when they look weak.
- Correctness over politeness.
- If uncertain about a fact, API, library, or current behavior: verify against documentation, source, or live system. Don't speculate.

This affects how I write chat responses too. Less emoji, less cheerleading, more "here's what I did, here's what worked, here's what I'd push back on."

## Implementation preferences

**Prefer:** explicit control flow · deterministic behavior · strong typing · small focused diffs · deletion over addition · stable abstractions · observable failures.

**Avoid:** magic behavior · implicit state · excessive abstraction · fallback-heavy systems · speculative generalization · compatibility layers · silent recovery paths.

## Error handling

Errors are signals. Three things to do with them:

1. Detect early.
2. Expose clearly.
3. Fix the cause.

Don't hide failures behind retries, defaults, silent catches, or backup execution paths.

## API and dependency policy

When working with APIs, libraries, or frameworks:

- Verify behavior against current documentation.
- Don't assume API contracts from memory.
- Check version-specific behavior — Next.js 16, React 19, Tailwind v4, Supabase JS 2, shadcn 4 all have breaking changes vs older versions.
- Prefer official docs over blog examples.

For this project, primary references live in `node_modules/next/dist/docs/` and at supabase.com/docs. `claude/architecture/*.md` cites versions explicitly.

## Final test for every PR

The best change is:

- Simple
- Explicit
- Predictable
- Easy to debug
- Difficult to misuse

Complexity must justify itself.

## What this changes about the AI workflow

The earlier `claude/architecture/ai-workflow.md` listed task hygiene (status updates, depends_on graph, etc.). Those still apply. **This file overrides ai-workflow.md where they conflict on style or trade-offs.** Specifically:

- Forbidden moves list still applies (don't touch RLS without authorization, etc.).
- Communication rules in §ai-workflow §A2 ("Mandatory status updates") still apply but I won't decorate them with cheerleading.
- The "Notes for next agent" section in each task file is a fact-log, not a victory lap. Document what happened and what's still open. Don't write motivational summaries.

## Audit log of self-corrections

Tracked here so a future agent can see what we changed and why.

| Date | Violation found | Fix | Commit |
|---|---|---|---|
| 2026-05-15 | `git add -A` swept unrelated files into a commit | Switch to targeted `git add <paths>`; will not use `-A` going forward | (this commit) |
| 2026-05-15 | `/api/health` had multi-branch fallback chain (PGRST205 + 42P01 + generic exception) | Simplified to a single happy-path query against `categories` | (this commit) |
| 2026-05-15 | `next.config.ts` silently degraded when `SUPABASE_URL` missing | Throw at config-load time; missing env is a deploy-blocker | (this commit) |
| 2026-05-15 | `lib/db/server.ts` try/catch had no comment | Added comment citing Next 16 Server Component cookie write restriction | (this commit) |
