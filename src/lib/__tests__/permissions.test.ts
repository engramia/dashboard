import { describe, it, expect } from "vitest";
import { hasPermission } from "../permissions";

// Mirror invariant: this matrix MUST stay in sync with
// `engramia/api/permissions.py` in the Core repo (workspace CLAUDE.md
// cross-repo invariants table). A drift here is a silent UX authz hole.
describe("hasPermission — role hierarchy", () => {
  // Reader-only perms
  const readerPerms = [
    "health",
    "metrics",
    "recall",
    "feedback:read",
    "skills:search",
    "jobs:list",
    "jobs:read",
    "analytics:read",
  ];

  // Editor-exclusive perms (everything reader has + these)
  const editorOnlyPerms = [
    "learn",
    "evaluate",
    "compose",
    "evolve",
    "analyze_failures",
    "skills:register",
    "aging",
    "feedback:decay",
    "jobs:cancel",
    "patterns:delete_own",
    "analytics:rollup",
  ];

  // Admin-exclusive perms (everything editor has + these)
  const adminOnlyPerms = [
    "patterns:delete",
    "import",
    "export",
    "keys:create",
    "keys:list",
    "keys:revoke",
    "keys:rotate",
    "governance:read",
    "governance:write",
    "governance:admin",
    "governance:delete",
    "audit:read",
    "billing:read",
    "billing:manage",
    "credentials:read",
    "credentials:write",
    "credentials:role_models:write",
    "credentials:failover_chain:write",
    "credentials:role_cost_limits:write",
  ];

  describe("reader", () => {
    it.each(readerPerms)("grants reader-tier perm: %s", (perm) => {
      expect(hasPermission("reader", perm)).toBe(true);
    });

    it.each(editorOnlyPerms)("denies editor-tier perm: %s", (perm) => {
      expect(hasPermission("reader", perm)).toBe(false);
    });

    it.each(adminOnlyPerms)("denies admin-tier perm: %s", (perm) => {
      expect(hasPermission("reader", perm)).toBe(false);
    });
  });

  describe("editor (subsumes reader)", () => {
    it.each([...readerPerms, ...editorOnlyPerms])("grants %s", (perm) => {
      expect(hasPermission("editor", perm)).toBe(true);
    });

    it.each(adminOnlyPerms)("denies admin-tier perm: %s", (perm) => {
      expect(hasPermission("editor", perm)).toBe(false);
    });
  });

  describe("admin (subsumes editor)", () => {
    it.each([...readerPerms, ...editorOnlyPerms, ...adminOnlyPerms])(
      "grants %s",
      (perm) => {
        expect(hasPermission("admin", perm)).toBe(true);
      },
    );
  });

  describe("owner — wildcard", () => {
    it.each([
      ...readerPerms,
      ...editorOnlyPerms,
      ...adminOnlyPerms,
      "future:permission:not:yet:defined",
      "anything",
      "",
    ])("grants %s via wildcard", (perm) => {
      expect(hasPermission("owner", perm)).toBe(true);
    });
  });

  describe("unknown roles", () => {
    it.each(["", "nobody", "ROOT", "Admin", "guest"])(
      "denies all perms for unknown role: %s",
      (role) => {
        expect(hasPermission(role, "health")).toBe(false);
        expect(hasPermission(role, "billing:manage")).toBe(false);
      },
    );
  });
});
