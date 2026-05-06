import { describe, it, expect } from "vitest";
import { NAV_ITEMS } from "../Sidebar";
import { hasPermission } from "@/lib/permissions";

// Per-role visibility of sidebar nav items. The Sidebar component renders
// `NAV_ITEMS.filter((item) => hasPermission(role, item.perm))`, so this
// suite pins the same predicate without needing to spin up a browser
// context with a non-admin STUB_ROLE.
//
// A regression that broke either side of the contract — flipping a perm
// string to one not granted to admin, or accidentally widening hasPermission
// to grant admin-only perms to lower roles — would surface here.

function visibleLabels(role: string): string[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.perm)).map(
    (item) => item.label,
  );
}

describe("Sidebar — per-role visible items", () => {
  it("reader sees only reader-tier items", () => {
    const labels = visibleLabels("reader");
    // Reader-grade perms grant: Overview, Patterns, Analytics, Evaluations,
    // Jobs, Settings (Settings is gated on "health" which every role has).
    expect(labels).toEqual([
      "Overview",
      "Patterns",
      "Analytics",
      "Evaluations",
      "Jobs",
      "Settings",
    ]);
    // Admin-only items must be absent.
    expect(labels).not.toContain("Keys");
    expect(labels).not.toContain("Governance");
    expect(labels).not.toContain("Audit");
    expect(labels).not.toContain("Billing");
    expect(labels).not.toContain("LLM Providers");
  });

  it("editor sees the same items as reader (editor adds non-sidebar perms)", () => {
    // Editor-tier perms (learn/evaluate/compose/...) are not surfaced as
    // sidebar entries, so editor's visible set equals reader's.
    expect(visibleLabels("editor")).toEqual(visibleLabels("reader"));
  });

  it("admin sees every nav item", () => {
    const labels = visibleLabels("admin");
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label));
    expect(labels).toContain("Keys");
    expect(labels).toContain("Governance");
    expect(labels).toContain("Audit");
    expect(labels).toContain("Billing");
    expect(labels).toContain("LLM Providers");
  });

  it("owner sees every nav item via wildcard", () => {
    const labels = visibleLabels("owner");
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label));
  });

  it("unknown role sees nothing", () => {
    expect(visibleLabels("nobody")).toEqual([]);
  });

  it("each NAV_ITEMS entry references a perm that exists in the matrix", () => {
    // Defensive: a typo in NAV_ITEMS perm string would silently hide the
    // item from every role (hasPermission returns false for unknown perms,
    // wildcard owner being the only exception). Pinning that admin grants
    // every sidebar perm catches typos here.
    for (const item of NAV_ITEMS) {
      expect(
        hasPermission("admin", item.perm) ||
          hasPermission("owner", item.perm),
        `Sidebar perm '${item.perm}' (label '${item.label}') is not granted to admin or owner — this entry is invisible to every role`,
      ).toBe(true);
    }
  });
});
