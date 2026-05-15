# ADR-001 — Supabase over Neon + Prisma + Clerk + Cloudinary

**Status:** Accepted · **Date:** 2026-05-15 · **Authors:** Owner + Claude

## Context

We need: Postgres for the catalog, Auth for admin, Storage for images, and ideally Edge Functions for background jobs. The two leading shapes:

- **A: Supabase** — Postgres + Auth + Storage + Edge Functions + RLS in one managed service.
- **B: Best-of-breed pieces** — Neon (Postgres) + Drizzle (ORM) + Clerk (auth) + Cloudinary (images) + a hosted background worker (Inngest / Trigger.dev).

## Decision

Use **Supabase**.

## Consequences

**Positive:**
- One service, one bill, one dashboard, one set of secrets to rotate.
- RLS lives next to the data — security policy is in SQL, version-controlled in migrations.
- Postgres FTS + `pg_trgm` covers search without a separate service.
- Edge Functions handle short jobs; longer jobs run on GitHub Actions (see [background-jobs.md](../architecture/background-jobs.md)).
- Storage public-URL pattern is straightforward; bucket-level RLS is supported.

**Negative:**
- Supabase Auth's `@supabase/ssr` is newer than `@clerk/nextjs`. Slightly less polished DX; we accept this.
- Supabase Edge Functions are Deno-based; if we ever need npm-only packages in background work, we route those jobs to GitHub Actions instead. Already designed for.
- Vendor lock-in is real, but Postgres is portable. Auth and Storage have export paths.

**Rollback path:**
- If Supabase becomes a bottleneck, the catalog Postgres is exportable to Neon/RDS/Aiven in hours. Auth migrates to Clerk in days (one-way password reset for everyone). Storage to S3/Cloudinary by copying objects + rewriting URLs.

## Alternatives considered

- **Neon + Drizzle + Clerk + Cloudinary** — cleaner pieces, more cost, four dashboards, more wiring. Reasonable for a team; overkill for a solo / AI-assisted MVP.
- **MongoDB Atlas + NextAuth + Cloudinary** — schemaless feels easy until you want faceted filtering, transactions on orders, or proper joins. Already ruled out.

## Revisit trigger

If we exceed Supabase's free tier on multiple resources simultaneously (DB > 500 MB AND Storage > 1 GB AND > 50k MAU), revisit cost-effectiveness against Neon + R2 + Clerk.
