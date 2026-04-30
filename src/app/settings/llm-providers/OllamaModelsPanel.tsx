"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  useCredentialModels,
  useRefreshCredentialModels,
} from "@/lib/hooks/useCredentials";
import { ApiError } from "@/lib/api";
import type { CredentialPublicView, OllamaModelInfo } from "@/lib/types";

interface Props {
  cred: CredentialPublicView;
  onError: (msg: string) => void;
}

/**
 * Phase 6.6 #4 surface — pulled-model viewer for Ollama credentials.
 *
 * Renders only when ``cred.provider === "ollama"`` (the calling page
 * should gate the component, not its rendering, to avoid useless query
 * traffic for non-Ollama tenants). Collapsible by design: the typical
 * tenant does not care about the model list once the credential is
 * working, so the panel stays out of the way until they expand it.
 *
 * Interaction model:
 *
 * - Closed: no network call. The chevron + "Pulled models" label sits
 *   under the credential row, costing nothing.
 * - First open: fires GET /v1/credentials/{id}/models. Shown response
 *   carries from_cache=true when the backend served a hit (1 h TTL on
 *   the server-side ``OllamaModelCache``).
 * - "Refresh" button: forces ``?force_refresh=true`` and primes the
 *   read-cache. Useful right after the operator runs ``ollama pull``
 *   on their server.
 *
 * Any failure (502 unreachable, 400 not-Ollama caught defensively, ...)
 * surfaces through the parent's error banner channel via ``onError``.
 */
export function OllamaModelsPanel({ cred, onError }: Props) {
  const [open, setOpen] = useState(false);
  const enabled = open && cred.provider === "ollama";
  const { data, isLoading, isError, error } = useCredentialModels(cred.id, enabled);
  const refresh = useRefreshCredentialModels();

  if (cred.provider !== "ollama") return null;

  const handleRefresh = async () => {
    onError("");
    try {
      await refresh.mutateAsync(cred.id);
    } catch (e) {
      onError(formatError(e));
    }
  };

  return (
    <div className="border-t border-border/40 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-1 py-1 text-xs text-text-secondary hover:bg-surface-hover"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Pulled models
          {data && (
            <Badge color="gray">
              {data.models.length} model{data.models.length === 1 ? "" : "s"}
            </Badge>
          )}
          {data?.from_cache && (
            <span
              className="text-text-secondary/60"
              title={`Last refreshed at ${new Date(data.fetched_at).toLocaleString()}. Cache TTL is 1 hour.`}
            >
              (cached)
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded border border-border/40 bg-surface-secondary p-3">
          {isLoading && (
            <div className="text-xs italic text-text-secondary">
              Fetching models from {cred.base_url}…
            </div>
          )}

          {isError && (
            <div className="flex items-start gap-2 rounded bg-red-900/20 p-2 text-xs text-red-100">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
              <div>
                <div className="font-semibold text-red-200">
                  Couldn&apos;t reach Ollama
                </div>
                <p className="mt-1">{formatError(error)}</p>
              </div>
            </div>
          )}

          {data && data.models.length === 0 && (
            <div className="rounded bg-yellow-900/20 p-2 text-xs text-yellow-100">
              <div className="font-semibold text-yellow-200">
                No models pulled
              </div>
              <p className="mt-1">
                Run <code>ollama pull &lt;model&gt;</code> on the server, then
                hit Refresh.
              </p>
            </div>
          )}

          {data && data.models.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-text-secondary">
                <tr>
                  <th className="pb-1 text-left font-medium">Name</th>
                  <th className="pb-1 text-left font-medium">Params</th>
                  <th className="pb-1 text-left font-medium">Quant</th>
                  <th className="pb-1 text-right font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m) => (
                  <ModelRow key={m.name} model={m} isDefault={m.name === cred.default_model || m.name.split(":")[0] === cred.default_model} />
                ))}
              </tbody>
            </table>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-text-secondary/70">
              {data && (
                <>
                  Fetched {new Date(data.fetched_at).toLocaleTimeString()}
                  {data.from_cache ? " (cached, ≤ 1 h old)" : " (live)"}
                </>
              )}
            </span>
            <Button
              variant="ghost"
              onClick={handleRefresh}
              disabled={refresh.isPending}
              title="Bypass the 1-hour cache and re-fetch from the Ollama server"
            >
              <RefreshCw
                size={12}
                className={refresh.isPending ? "animate-spin" : ""}
              />
              Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({ model, isDefault }: { model: OllamaModelInfo; isDefault: boolean }) {
  return (
    <tr className="border-t border-border/40">
      <td className="py-1 font-mono text-text-primary">
        {model.name}
        {isDefault && (
          <Badge color="green" className="ml-2">
            default
          </Badge>
        )}
      </td>
      <td className="py-1 text-text-secondary">{model.param_count ?? "—"}</td>
      <td className="py-1 text-text-secondary">{model.quantization ?? "—"}</td>
      <td className="py-1 text-right font-mono text-text-secondary">
        {formatBytes(model.size_bytes)}
      </td>
    </tr>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1_000_000;
  return `${mb.toFixed(0)} MB`;
}

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return "Request failed.";
}
