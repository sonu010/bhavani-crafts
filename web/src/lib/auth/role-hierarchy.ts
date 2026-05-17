/**
 * Total ordering on profile_role.
 *
 *   owner > admin > editor > viewer
 *
 * `roleSatisfies(actual, required)` returns true when `actual` is at
 * least as privileged as `required`. There is intentionally no "or this
 * role" combinator — if you need that, the policy is wrong.
 *
 * Pure function. No Supabase, no globals. Cheap to import in proxy code.
 */
import type { Database } from "@/lib/db/types.gen";

export type ProfileRole = Database["public"]["Enums"]["profile_role"];

const RANK: Record<ProfileRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export function roleSatisfies(actual: ProfileRole, required: ProfileRole): boolean {
  return RANK[actual] >= RANK[required];
}

export function compareRoles(a: ProfileRole, b: ProfileRole): number {
  return RANK[a] - RANK[b];
}
