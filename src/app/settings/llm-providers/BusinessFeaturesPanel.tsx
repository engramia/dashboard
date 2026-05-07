"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ApiError } from "@/lib/api";
import {
  useUpdateRoleModels,
  useUpdateFailoverChain,
  useUpdateRoleCostLimits,
} from "@/lib/hooks/useCredentials";
import { hasFeature } from "@/lib/entitlements";
import { KNOWN_ROLES, ROLE_DESCRIPTIONS } from "@/lib/known-roles";
import { formatCents } from "@/lib/rate-cards";
import type { CredentialPublicView } from "@/lib/types";

interface Props {
  cred: CredentialPublicView;
  allCreds: CredentialPublicView[]; // for failover dropdown
  currentTier: string;
  onError: (msg: string) => void;
}

/**
 * Collapsible Business+ tier panel below each credential row.
 *
 * Houses two editors — per-role routing and failover chain — that share
 * the same gating, ETag-protected mutation flow, and downgrade banner.
 * Rendered inside the existing settings page; no new route needed.
 */
export function BusinessFeaturesPanel(props: Props) {
  const { cred, currentTier } = props;
  const [open, setOpen] = useState(false);

  const eligible = hasFeature(currentTier, "byok.role_models");
  const hasConfig =
    Object.keys(cred.role_models).length > 0 ||
    cred.failover_chain.length > 0 ||
    Object.keys(cred.role_cost_limits).length > 0;
  const inGracePeriod = !eligible && hasConfig;

  return (
    <div className="border-t border-border/40 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-1 py-1 text-xs text-text-secondary hover:bg-surface-hover"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Advanced routing
          {!eligible && <Badge color="gray">Business+</Badge>}
          {inGracePeriod && (
            <Badge color="amber">Grace period — upgrade to keep editing</Badge>
          )}
          {hasConfig && eligible && <Badge color="green">Configured</Badge>}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4 rounded border border-border/40 bg-surface-secondary p-3">
          {!eligible && (
            <UpgradeNotice
              hasConfig={hasConfig}
              currentTier={currentTier}
            />
          )}

          <RoleModelsEditor {...props} disabled={!eligible} />
          <FailoverChainEditor {...props} disabled={!eligible} />
          <RoleCostLimitsEditor {...props} disabled={!eligible} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrade notice
// ---------------------------------------------------------------------------

function UpgradeNotice({
  hasConfig,
  currentTier,
}: {
  hasConfig: boolean;
  currentTier: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded bg-yellow-900/20 p-3 text-xs text-yellow-100">
      <Lock size={14} className="mt-0.5 shrink-0 text-yellow-400" />
      <div className="flex-1">
        <div className="font-semibold text-yellow-200">
          Business plan required
        </div>
        <p className="mt-1">
          Per-role routing and provider failover are gated to the Business
          and Enterprise plans. You are currently on{" "}
          <span className="font-medium">{currentTier}</span>.
        </p>
        {hasConfig && (
          <p className="mt-2">
            Your existing configuration is still active (grace period). Edits
            are blocked until you upgrade — or clear it below.
          </p>
        )}
        <a
          href="/billing"
          className="mt-2 inline-block text-yellow-300 hover:underline"
        >
          Upgrade →
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-role models editor
// ---------------------------------------------------------------------------

function RoleModelsEditor({
  cred,
  disabled,
  onError,
}: Props & { disabled: boolean }) {
  const [draft, setDraft] = useState<Array<[string, string]>>(
    Object.entries(cred.role_models),
  );
  const [submitting, setSubmitting] = useState(false);
  const update = useUpdateRoleModels();

  const dirty =
    JSON.stringify(Object.fromEntries(draft)) !==
    JSON.stringify(cred.role_models);

  const addRow = () => setDraft([...draft, ["", ""]]);
  const removeRow = (i: number) =>
    setDraft(draft.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: 0 | 1, val: string) =>
    setDraft(
      draft.map((row, idx) =>
        idx === i ? ((field === 0 ? [val, row[1]] : [row[0], val]) as [string, string]) : row,
      ),
    );

  const handleSave = async () => {
    onError("");
    setSubmitting(true);
    try {
      const role_models: Record<string, string> = {};
      for (const [role, model] of draft) {
        const r = role.trim().toLowerCase();
        const m = model.trim();
        if (!r || !m) continue;
        role_models[r] = m;
      }
      await update.mutateAsync({ cred, req: { role_models } });
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    onError("");
    setSubmitting(true);
    try {
      await update.mutateAsync({ cred, req: { role_models: {} } });
      setDraft([]);
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">
          Per-role model routing
        </h3>
        <Button
          variant="ghost"
          onClick={addRow}
          disabled={disabled || draft.length >= 16}
        >
          <Plus size={12} />
          Add role
        </Button>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Map an Engramia role to a different model on this credential.
        Empty rows are ignored.
      </p>

      {draft.length === 0 ? (
        <div className="mt-2 text-xs italic text-text-secondary">
          No overrides — every call uses the credential&apos;s default_model.
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {draft.map(([role, model], i) => (
            <div key={i} className="flex items-center gap-2">
              <RoleSelect
                value={role}
                onChange={(v) => updateRow(i, 0, v)}
                disabled={disabled}
              />
              <Input
                value={model}
                placeholder="model id (e.g. gpt-4.1-mini)"
                onChange={(e) => updateRow(i, 1, e.target.value)}
                disabled={disabled}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={disabled}
                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                aria-label="Remove role"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button
          onClick={handleSave}
          disabled={disabled || submitting || !dirty}
        >
          Save
        </Button>
        {Object.keys(cred.role_models).length > 0 && (
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={submitting}
            title="Clearing is allowed even on lower tiers"
          >
            Clear all
          </Button>
        )}
      </div>
    </section>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  // Inline style on each <option> mirrors the parent <select> background +
  // text colour so Chromium's native dropdown panel (which falls back to
  // OS-default light grey on dark themes when CSS custom properties don't
  // cascade through to the popup) stays readable. Other browsers honour
  // less of this but the parent select still renders correctly.
  const optionStyle = { backgroundColor: "#252832", color: "#e2e8f0" };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
      aria-label="Role"
    >
      <option value="" style={optionStyle}>— role —</option>
      {KNOWN_ROLES.map((r) => (
        <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]} style={optionStyle}>
          {r}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Failover chain editor
// ---------------------------------------------------------------------------

function FailoverChainEditor({
  cred,
  allCreds,
  disabled,
  onError,
}: Props & { disabled: boolean }) {
  const [draft, setDraft] = useState<string[]>(cred.failover_chain);
  const [submitting, setSubmitting] = useState(false);
  const update = useUpdateFailoverChain();

  const dirty = JSON.stringify(draft) !== JSON.stringify(cred.failover_chain);
  // Same-tenant active credentials, excluding self.
  const candidates = allCreds.filter(
    (c) => c.id !== cred.id && c.status === "active",
  );

  const addEntry = () => {
    if (draft.length >= 2) return;
    setDraft([...draft, ""]);
  };
  const removeEntry = (i: number) =>
    setDraft(draft.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, val: string) =>
    setDraft(draft.map((v, idx) => (idx === i ? val : v)));

  const handleSave = async () => {
    onError("");
    setSubmitting(true);
    try {
      const chain = draft.filter((id) => id.length > 0);
      await update.mutateAsync({ cred, req: { failover_chain: chain } });
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    onError("");
    setSubmitting(true);
    try {
      await update.mutateAsync({ cred, req: { failover_chain: [] } });
      setDraft([]);
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">
          Provider failover chain
        </h3>
        <Button
          variant="ghost"
          onClick={addEntry}
          disabled={disabled || draft.length >= 2}
        >
          <Plus size={12} />
          Add fallback
        </Button>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Order matters. On a transient error, Engramia tries each fallback
        in sequence. Auth errors fail fast — never failover.
      </p>

      {draft.length === 0 ? (
        <div className="mt-2 text-xs italic text-text-secondary">
          No failover. This credential&apos;s errors surface directly.
        </div>
      ) : (
        <ol className="mt-2 space-y-1">
          {draft.map((entry, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">{i + 1}.</span>
              <select
                value={entry}
                onChange={(e) => updateEntry(i, e.target.value)}
                disabled={disabled}
                className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                aria-label={`Fallback ${i + 1}`}
              >
                {/* See RoleSelect: inline style keeps Chromium's native
                    dropdown panel readable on dark themes. */}
                <option value="" style={{ backgroundColor: "#252832", color: "#e2e8f0" }}>
                  — select credential —
                </option>
                {candidates.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    style={{ backgroundColor: "#252832", color: "#e2e8f0" }}
                  >
                    {c.provider} ({c.key_fingerprint})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeEntry(i)}
                disabled={disabled}
                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                aria-label="Remove fallback"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex gap-2">
        <Button
          onClick={handleSave}
          disabled={disabled || submitting || !dirty}
        >
          Save
        </Button>
        {cred.failover_chain.length > 0 && (
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={submitting}
          >
            Clear chain
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Per-role cost ceiling editor (#2b)
// ---------------------------------------------------------------------------

function RoleCostLimitsEditor({
  cred,
  disabled,
  onError,
}: Props & { disabled: boolean }) {
  // The user types dollars (UX-friendly); we send cents (API contract).
  // Round to 2dp on display to avoid float-drift confusion.
  const initial = Object.entries(cred.role_cost_limits).map(
    ([role, cents]) => [role, (cents / 100).toFixed(2)] as [string, string],
  );
  const [draft, setDraft] = useState<Array<[string, string]>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const update = useUpdateRoleCostLimits();

  // Compute dirty by reconstructing the cents map from the draft and
  // comparing against the persisted shape. String compare on entries
  // would treat "5.00" vs "5" as different even when functionally equal.
  const draftAsCents = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [role, dollars] of draft) {
      const r = role.trim().toLowerCase();
      const cents = Math.round(parseFloat(dollars || "0") * 100);
      if (!r || !Number.isFinite(cents) || cents <= 0) continue;
      out[r] = cents;
    }
    return out;
  };
  const dirty =
    JSON.stringify(draftAsCents()) !== JSON.stringify(cred.role_cost_limits);

  const addRow = () => setDraft([...draft, ["", ""]]);
  const removeRow = (i: number) =>
    setDraft(draft.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: 0 | 1, val: string) =>
    setDraft(
      draft.map((row, idx) =>
        idx === i ? ((field === 0 ? [val, row[1]] : [row[0], val]) as [string, string]) : row,
      ),
    );

  const handleSave = async () => {
    onError("");
    setSubmitting(true);
    try {
      await update.mutateAsync({ cred, req: { role_cost_limits: draftAsCents() } });
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    onError("");
    setSubmitting(true);
    try {
      await update.mutateAsync({ cred, req: { role_cost_limits: {} } });
      setDraft([]);
    } catch (e) {
      onError(formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">
          Per-role cost ceiling
        </h3>
        <Button
          variant="ghost"
          onClick={addRow}
          disabled={disabled || draft.length >= 16}
        >
          <Plus size={12} />
          Add ceiling
        </Button>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Monthly $ cap per role override. When reached, calls fall back to{" "}
        <code>default_model</code> for that role until the next UTC month.
        No 429 — service continuity. Only applies to roles configured above.
      </p>

      {draft.length === 0 ? (
        <div className="mt-2 text-xs italic text-text-secondary">
          No ceilings configured. Role overrides bill against your provider
          without a cap.
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {draft.map(([role, dollars], i) => {
            const persistedCents = cred.role_cost_limits[role.toLowerCase()];
            return (
              <div key={i} className="flex items-center gap-2">
                <RoleSelect
                  value={role}
                  onChange={(v) => updateRow(i, 0, v)}
                  disabled={disabled}
                />
                <div className="flex flex-1 items-center gap-1">
                  <span className="text-xs text-text-secondary">$</span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={dollars}
                    placeholder="50.00"
                    onChange={(e) => updateRow(i, 1, e.target.value)}
                    disabled={disabled}
                    className="flex-1"
                  />
                  <span className="text-xs text-text-secondary">/mo</span>
                </div>
                {persistedCents !== undefined && (
                  <span
                    className="text-xs text-text-secondary"
                    title={`Persisted: ${persistedCents} cents`}
                  >
                    ({formatCents(persistedCents)})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={disabled}
                  className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                  aria-label="Remove ceiling"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button
          onClick={handleSave}
          disabled={disabled || submitting || !dirty}
        >
          Save
        </Button>
        {Object.keys(cred.role_cost_limits).length > 0 && (
          <Button variant="ghost" onClick={handleClear} disabled={submitting}>
            Clear all
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

function formatError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.errorCode === "ENTITLEMENT_REQUIRED") {
      return "Business plan required for this feature. Upgrade in /billing.";
    }
    if (e.errorCode === "PRECONDITION_FAILED") {
      return "Configuration was modified by another admin — please refresh and retry.";
    }
    if (e.errorCode === "PRECONDITION_REQUIRED") {
      return "Internal error: missing If-Match header. Refresh and retry.";
    }
    if (e.errorCode === "FAILOVER_CHAIN_INVALID") {
      return e.detail;
    }
    return e.detail;
  }
  return "Request failed. Check your connection and try again.";
}
