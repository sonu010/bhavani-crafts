/**
 * Unit tests for the role-hierarchy total ordering.
 * Covers every (actual, required) pair across all four roles = 16 cases.
 */
import { describe, expect, it } from "vitest";
import { compareRoles, roleSatisfies, type ProfileRole } from "@/lib/auth/role-hierarchy";

const ROLES: readonly ProfileRole[] = ["viewer", "editor", "admin", "owner"];

describe("roleSatisfies", () => {
  it.each(ROLES)("a %s satisfies viewer", (actual) => {
    expect(roleSatisfies(actual, "viewer")).toBe(true);
  });

  it("viewer does not satisfy editor, admin, or owner", () => {
    expect(roleSatisfies("viewer", "editor")).toBe(false);
    expect(roleSatisfies("viewer", "admin")).toBe(false);
    expect(roleSatisfies("viewer", "owner")).toBe(false);
  });

  it("editor satisfies viewer and editor, not admin or owner", () => {
    expect(roleSatisfies("editor", "viewer")).toBe(true);
    expect(roleSatisfies("editor", "editor")).toBe(true);
    expect(roleSatisfies("editor", "admin")).toBe(false);
    expect(roleSatisfies("editor", "owner")).toBe(false);
  });

  it("admin satisfies viewer, editor, admin, not owner", () => {
    expect(roleSatisfies("admin", "viewer")).toBe(true);
    expect(roleSatisfies("admin", "editor")).toBe(true);
    expect(roleSatisfies("admin", "admin")).toBe(true);
    expect(roleSatisfies("admin", "owner")).toBe(false);
  });

  it("owner satisfies every role", () => {
    for (const required of ROLES) {
      expect(roleSatisfies("owner", required)).toBe(true);
    }
  });
});

describe("compareRoles", () => {
  it("returns positive when a outranks b, negative the other way, zero on equal", () => {
    expect(compareRoles("owner", "viewer")).toBeGreaterThan(0);
    expect(compareRoles("viewer", "owner")).toBeLessThan(0);
    expect(compareRoles("admin", "admin")).toBe(0);
  });

  it("sorts viewer < editor < admin < owner", () => {
    const shuffled: ProfileRole[] = ["admin", "owner", "viewer", "editor"];
    const sorted = [...shuffled].sort(compareRoles);
    expect(sorted).toEqual<ProfileRole[]>(["viewer", "editor", "admin", "owner"]);
  });
});
