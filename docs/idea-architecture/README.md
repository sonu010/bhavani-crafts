# Bhavani Crafts idea architecture

This folder turns the project's markdown and extracted design ideas into a visual architecture pack.

Run the pipeline from the repository root:

```bash
node scripts/extract-markdown-architecture.mjs
```

Generated output lives in [`generated/`](generated/):

- [`01-markdown-inventory.md`](generated/01-markdown-inventory.md) — every markdown and idea prototype source, grouped by source-of-truth rank.
- [`02-idea-map.md`](generated/02-idea-map.md) — current product idea, ADR spine, active tracks, deferred prototypes.
- [`03-complete-architecture.md`](generated/03-complete-architecture.md) — Mermaid diagrams for system context, components, domain classes, auth, admin mutations, storefront caching, search, image flow, background jobs, and AI review.
- [`04-task-roadmap.md`](generated/04-task-roadmap.md) — phase pipeline, task counts, current dependency chain, and stub list.
- [`05-extraction-pipeline.md`](generated/05-extraction-pipeline.md) — how the extraction works.
- [`00-source-index.json`](generated/00-source-index.json) — machine-readable source index.

Source-of-truth rule: `claude/architecture/*`, accepted ADRs, `claude/plans.md`, and task files define the current rebuild. Legacy prototype references and design exports are preserved as ideas, not implementation contracts.
