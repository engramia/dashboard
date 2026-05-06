"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Key as KeyIcon,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  useCredentials,
  useCreateCredential,
  useRevokeCredential,
  useValidateCredential,
} from "@/lib/hooks/useCredentials";
import { useBillingStatus } from "@/lib/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { BusinessFeaturesPanel } from "./BusinessFeaturesPanel";
import { OllamaModelsPanel } from "./OllamaModelsPanel";
import type {
  CredentialProvider,
  CredentialPurpose,
  CredentialPublicView,
  CredentialStatus,
} from "@/lib/types";

// Provider metadata: human label, where to obtain a key, and whether
// base_url is required. Ordering reflects the BYOK pricing strategy
// (native providers first, use-at-own-risk last).
const PROVIDERS: Array<{
  id: CredentialProvider;
  label: string;
  consoleUrl: string;
  requiresBaseUrl: boolean;
  hint: string;
  defaultModel: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    consoleUrl: "https://platform.openai.com/api-keys",
    requiresBaseUrl: false,
    hint: "Starts with sk-…",
    defaultModel: "gpt-4.1",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    requiresBaseUrl: false,
    hint: "Starts with sk-ant-…",
    defaultModel: "claude-sonnet-4-6",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    requiresBaseUrl: false,
    hint: "Starts with AIza…",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "ollama",
    label: "Ollama (use at your own risk)",
    consoleUrl: "https://ollama.com/download",
    requiresBaseUrl: true,
    hint: "Self-hosted on your network",
    defaultModel: "llama3.3",
  },
  {
    id: "openai_compat",
    label: "OpenAI-compatible (Together / Groq / vLLM, use at your own risk)",
    consoleUrl: "",
    requiresBaseUrl: true,
    hint: "Provide endpoint base_url + key from your provider",
    defaultModel: "",
  },
];

function statusBadge(status: CredentialStatus) {
  if (status === "active") {
    return <Badge color="green">Active</Badge>;
  }
  if (status === "invalid") {
    return <Badge color="red">Invalid</Badge>;
  }
  return <Badge color="gray">Revoked</Badge>;
}

function providerLabel(id: CredentialProvider) {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

export default function LlmProvidersPage() {
  const credentialsQuery = useCredentials();
  const billingQuery = useBillingStatus();
  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CredentialPublicView | null>(
    null,
  );
  const [bannerError, setBannerError] = useState<string>("");

  const credentials = credentialsQuery.data ?? [];
  const currentTier = billingQuery.data?.plan_tier ?? "developer";
  const activeCount = credentials.filter((c) => c.status === "active").length;
  const hasAnyActive = activeCount > 0;

  // The list query failing with 503 BYOK_NOT_ENABLED is a special case —
  // surface it inline so the operator who hasn't enabled BYOK on the
  // backend understands why the page is empty.
  const queryError = credentialsQuery.error;
  const byokDisabled =
    queryError instanceof ApiError &&
    (queryError.detail.includes("BYOK is not enabled") ||
      String((queryError as ApiError).detail).includes("BYOK_NOT_ENABLED"));

  return (
    <Shell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              LLM Providers
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Bring your own API keys. Engramia stores them encrypted at rest
              and uses them only for your evaluations.{" "}
              <a
                href="https://engramia.readthedocs.io/byok/"
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Learn more
              </a>
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} disabled={byokDisabled}>
            <Plus size={16} />
            Add provider
          </Button>
        </div>

        {/* Demo-mode banner — surfaced when no active credential exists */}
        {!byokDisabled && credentialsQuery.isFetched && !hasAnyActive && (
          <Card className="border-yellow-700/40 bg-yellow-900/20">
            <div className="flex gap-3">
              <AlertCircle
                size={20}
                className="mt-0.5 shrink-0 text-yellow-400"
              />
              <div>
                <div className="text-sm font-semibold text-yellow-200">
                  Demo mode is active
                </div>
                <p className="mt-1 text-sm text-yellow-100/80">
                  Without an LLM provider key, Engramia returns simulated
                  responses for {`/v1/evaluate`} and other LLM features. You
                  get a 50-call/month demo allowance. Add a real key to unlock
                  full functionality.
                </p>
              </div>
            </div>
          </Card>
        )}

        {byokDisabled && (
          <Card className="border-orange-700/40 bg-orange-900/20">
            <div className="flex gap-3">
              <AlertCircle
                size={20}
                className="mt-0.5 shrink-0 text-orange-400"
              />
              <div>
                <div className="text-sm font-semibold text-orange-200">
                  BYOK is not enabled on this Engramia instance
                </div>
                <p className="mt-1 text-sm text-orange-100/80">
                  This Engramia deployment is using a server-side LLM key. Ask
                  your operator to set <code>ENGRAMIA_BYOK_ENABLED=true</code>{" "}
                  to enable per-tenant credentials.
                </p>
              </div>
            </div>
          </Card>
        )}

        {bannerError && (
          <Card className="border-red-700/40 bg-red-900/20">
            <div className="flex gap-3">
              <XCircle size={20} className="mt-0.5 shrink-0 text-red-400" />
              <div className="text-sm text-red-100">{bannerError}</div>
            </div>
          </Card>
        )}

        {/* Credentials list */}
        <Card>
          <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Configured providers
            </h2>
            {credentialsQuery.isFetching && (
              <span className="text-xs text-text-secondary">Refreshing…</span>
            )}
          </div>

          {credentialsQuery.isLoading && (
            <div className="py-8 text-center text-sm text-text-secondary">
              Loading credentials…
            </div>
          )}

          {credentialsQuery.isFetched &&
            !byokDisabled &&
            credentials.length === 0 && (
              <div className="py-8 text-center text-sm text-text-secondary">
                <KeyIcon size={28} className="mx-auto mb-2 opacity-40" />
                No providers configured yet. Add one to start using real LLM
                evaluations.
              </div>
            )}

          {credentials.length > 0 && (
            <div className="divide-y divide-border">
              {credentials.map((cred) => (
                <div key={cred.id} className="py-1">
                  <CredentialRow
                    cred={cred}
                    onRevoke={() => setRevokeTarget(cred)}
                    onError={setBannerError}
                  />
                  {cred.status !== "revoked" && cred.provider === "ollama" && (
                    <OllamaModelsPanel cred={cred} onError={setBannerError} />
                  )}
                  {cred.status !== "revoked" && (
                    <BusinessFeaturesPanel
                      cred={cred}
                      allCreds={credentials}
                      currentTier={currentTier}
                      onError={setBannerError}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add credential modal */}
      <AddCredentialModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onError={setBannerError}
      />

      {/* Revoke confirmation modal */}
      <RevokeCredentialModal
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onError={setBannerError}
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Credential row
// ---------------------------------------------------------------------------

function CredentialRow({
  cred,
  onRevoke,
  onError,
}: {
  cred: CredentialPublicView;
  onRevoke: () => void;
  onError: (msg: string) => void;
}) {
  const validate = useValidateCredential();

  const handleValidate = async () => {
    onError("");
    try {
      await validate.mutateAsync(cred.id);
    } catch (e) {
      onError(
        e instanceof ApiError ? e.detail : "Validation request failed.",
      );
    }
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {providerLabel(cred.provider)}
          </span>
          {statusBadge(cred.status)}
          <span className="text-xs text-text-secondary">
            ({cred.purpose})
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span className="font-mono">{cred.key_fingerprint}</span>
          {cred.default_model && <span>model: {cred.default_model}</span>}
          {cred.last_validated_at && (
            <span>
              validated {new Date(cred.last_validated_at).toLocaleString()}
            </span>
          )}
          {cred.last_validation_error && (
            <span className="text-red-400">
              error: {cred.last_validation_error}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cred.status === "active" && (
          <Button
            variant="ghost"
            onClick={handleValidate}
            disabled={validate.isPending}
            title="Re-validate against provider"
          >
            <RefreshCw
              size={14}
              className={validate.isPending ? "animate-spin" : ""}
            />
            Validate
          </Button>
        )}
        {cred.status !== "revoked" && (
          <Button variant="ghost" onClick={onRevoke} title="Revoke">
            <Trash2 size={14} className="text-red-400" />
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add credential modal
// ---------------------------------------------------------------------------

function AddCredentialModal({
  open,
  onClose,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [provider, setProvider] = useState<CredentialProvider>("openai");
  const [purpose] = useState<CredentialPurpose>("llm");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const create = useCreateCredential();

  const meta = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  const reset = () => {
    setApiKey("");
    setBaseUrl("");
    setDefaultModel("");
    setSubmitting(false);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError("");
    setSubmitting(true);
    try {
      await create.mutateAsync({
        provider,
        purpose,
        api_key: apiKey,
        base_url: meta.requiresBaseUrl ? baseUrl : null,
        default_model: defaultModel || null,
      });
      // Wipe the secret state in the same React commit that flips to the
      // success view below. The form (and its <input>) unmounts in that
      // commit, so the plaintext key disappears from the DOM immediately —
      // no 800ms window where a screenshot or DOM snapshot could grab it.
      // Belt-and-suspenders: clear the values too in case the form is ever
      // refactored to keep the input mounted across the success flash.
      setApiKey("");
      setBaseUrl("");
      setDefaultModel("");
      setSuccess(true);
      // Auto-close on success after a brief confirmation flash so the user
      // sees the row appear in the list.
      setTimeout(() => {
        reset();
        onClose();
      }, 800);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.detail
          : "Could not save credential. Please try again.";
      onError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add LLM provider">
      {success ? (
        // Swap the form for a success view in the same commit that wipes
        // the secret state. The <input type="password"> with the plaintext
        // value is unmounted, so the key disappears from the DOM
        // immediately — no race window during the 800ms auto-close.
        <div className="py-8 text-center">
          <CheckCircle2
            className="mx-auto mb-3 text-green-400"
            size={36}
            aria-hidden="true"
          />
          <p className="text-sm text-text-primary">
            Saved. Engramia validated the key and is now using it.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-text-secondary">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as CredentialProvider)
            }
            disabled={submitting}
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {meta.consoleUrl && (
          <p className="text-xs text-text-secondary">
            Get a key from{" "}
            <a
              href={meta.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {meta.consoleUrl}
            </a>
            . {meta.hint}.
          </p>
        )}

        {meta.requiresBaseUrl && (
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Base URL
            </label>
            <Input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "http://localhost:11434/v1"
                  : "https://api.example.com/v1"
              }
              required
              disabled={submitting}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-text-secondary">
            API key
          </label>
          {/* type=password + autocomplete-off + data-1p-ignore so the
              browser/password-manager doesn't capture or autofill the key. */}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={meta.hint}
            required
            disabled={submitting}
            autoComplete="off"
            data-1p-ignore
            data-form-type="other"
            spellCheck="false"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-secondary">
            🔒 Sent over TLS. Engramia never displays this key again — keep
            your own copy. Clear your clipboard after pasting.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary">
            Default model{" "}
            <span className="text-text-secondary/60">(optional)</span>
          </label>
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={meta.defaultModel || "Provider-specific model id"}
            disabled={submitting}
            className="mt-1"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !apiKey}>
            {submitting ? "Validating…" : "Validate & save"}
          </Button>
        </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Revoke confirmation modal
// ---------------------------------------------------------------------------

function RevokeCredentialModal({
  target,
  onClose,
  onError,
}: {
  target: CredentialPublicView | null;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const revoke = useRevokeCredential();
  if (!target) return null;

  const handleRevoke = async () => {
    onError("");
    try {
      await revoke.mutateAsync(target.id);
      onClose();
    } catch (e) {
      onError(
        e instanceof ApiError ? e.detail : "Revoke request failed.",
      );
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title="Revoke credential">
      <p className="text-sm text-text-secondary">
        Revoke{" "}
        <span className="font-medium text-text-primary">
          {providerLabel(target.provider)}
        </span>{" "}
        ({target.key_fingerprint})? Engramia will fall back to demo mode for
        the affected purpose until you add a new key.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleRevoke} disabled={revoke.isPending}>
          {revoke.isPending ? "Revoking…" : "Revoke"}
        </Button>
      </div>
    </Modal>
  );
}
