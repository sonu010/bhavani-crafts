# What to expect each day

A short guide so the rebuild feels predictable.

## Rhythm

1. **AI picks the next task** from `claude/plans.md` — the highest-numbered task that's `not_started` and whose dependencies are `done`.
2. **AI works the task end-to-end** — creates/edits files, runs tests, marks status.
3. **AI updates `claude/progress.md`** — counts, last 5 done, next 3 to work.
4. **AI tells you what to look at**, if anything visible changed. You can run `pnpm dev` locally and click around if you want.
5. **Repeat.**

Each task is bounded (60–180 lines of guidance, plus tests). One task = one chat turn ideally.

## When you'll be asked for something

Specific moments where you'll be pinged:

| Moment | What you'll be asked |
|---|---|
| P0-T08 | Supabase credentials (see `01-share-supabase-credentials.md`) |
| P0-T08 | Region confirmation (Mumbai recommended) |
| First migration push | Approval to apply schema to your Supabase project |
| Before seed runs | Approval to write ~8,500 unpublished products to Supabase |
| First `git push` | Approval to push the rebuild branch to GitHub |
| AI features (Phase 4) | Anthropic API key + $20/mo budget confirmation |
| Real-content gate | 20+ real products, 8 category photos, address, hours, WhatsApp, logo (see `05-content-the-AI-needs-from-you.md`) |
| Pre-launch | Approval to merge `rebuild-v2` → `main` (the actual go-live) |

## What "blocked" means

If the AI hits a blocker (waiting on credentials, an asset, a decision), it:

- Stops on that specific task.
- Adds an entry to `claude/blockers.md`.
- **Moves to the next unblocked task** if there is one.
- Tells you in chat: "blocked on X; switching to Y."

So progress rarely halts entirely — it just routes around.

## What "done" means for a task

- The task file's frontmatter shows `status: done`.
- The verification commands in the task file pass.
- An audit log entry exists if it was a mutation.
- The next task can pick up cold without needing context from you.

You don't need to verify these — the AI does. You can spot-check by reading the task file's "Notes for next agent" section.

## What to do if something feels off

- "I don't understand what the AI just did" → ask in chat; the AI explains.
- "I don't like a design choice" → say so; the AI's design is documented in `claude/architecture/design-system.md` and can be revised via an ADR.
- "I think there's a security/privacy problem" → say so immediately. The AI has a hard rule to pause and surface security concerns.
- "I want to see the live build" → `cd web && pnpm dev` opens http://localhost:3000.

## Pace expectation

- **Aggressive** (best case): rebuild ships in ~14 days of focused work.
- **Realistic** (plan for this): 3–5 weeks.

The gap comes from content turnaround (your photos, real product list), design iteration, and the unavoidable surprises in any rebuild. Don't over-promise on the rebuild timeline to anyone external until we're past the real-content gate.

## Daily check-in (optional but recommended)

Even a 2-minute glance once a day at:

- `claude/progress.md` — what shipped, what's next
- `claude/blockers.md` — anything waiting on you

…keeps the rebuild moving without you having to track anything.
