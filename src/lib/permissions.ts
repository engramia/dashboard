// Mirror of engramia/api/permissions.py in the Core repo. Drift here is a
// silent UX authz hole — every role's permission set MUST match the Core
// definition exactly. permissions.test.ts pins the expected matrix.

const READER = [
  "health", "metrics", "recall", "feedback:read", "skills:search",
  "jobs:list", "jobs:read", "analytics:read",
];

const EDITOR = [
  ...READER,
  "learn", "evaluate", "compose", "evolve", "analyze_failures",
  "skills:register", "aging", "feedback:decay", "jobs:cancel",
  "patterns:delete_own", "analytics:rollup",
];

const ADMIN = [
  ...EDITOR,
  "patterns:delete", "import", "export",
  "keys:create", "keys:list", "keys:revoke", "keys:rotate",
  "governance:read", "governance:write", "governance:admin", "governance:delete",
  // Phase 6.0: Audit log viewer (admin+).
  "audit:read",
  "billing:read", "billing:manage",
  // Phase 6.6 BYOK — admin+ manage tenant LLM provider credentials.
  "credentials:read", "credentials:write",
  // Phase 6.6 #2 — per-role routing, failover chain, role cost ceiling.
  "credentials:role_models:write",
  "credentials:failover_chain:write",
  "credentials:role_cost_limits:write",
];

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  reader: new Set(READER),
  editor: new Set(EDITOR),
  admin: new Set(ADMIN),
  owner: new Set(["*"]),
};

export function hasPermission(role: string, perm: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.has("*") || perms.has(perm);
}

// RBAC role descriptions — owner / admin / editor / reader. Distinct from
// the BYOK semantic LLM-call roles in `@/lib/known-roles` (default / eval /
// architect / coder / evolve / recall) — both used to be exported as
// `ROLE_DESCRIPTIONS` from their respective modules, which caused
// import-site confusion. The `RBAC_` prefix scopes this constant to the
// permission system; the BYOK equivalent stays as `ROLE_DESCRIPTIONS`
// because that's the dominant meaning inside the LLM-providers UI.
export const RBAC_ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:
    "Full access to everything, including organization settings and billing.",
  admin:
    "Manage API keys, governance, audit log, billing, and BYOK credentials. Includes all editor permissions.",
  editor:
    "Learn, evaluate, compose and evolve patterns; register skills; delete own patterns. Includes all reader permissions.",
  reader:
    "Read-only: recall, metrics, analytics, feedback, jobs, skills search.",
};
