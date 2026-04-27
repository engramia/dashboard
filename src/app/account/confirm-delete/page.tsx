"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getBackendUrl } from "@/lib/backend-url";

type Status =
  | "ready"
  | "submitting"
  | "deleted"
  | "expired"
  | "consumed"
  | "invalid"
  | "error";

interface DeletionResult {
  tenant_id: string;
  patterns_deleted: number;
  keys_revoked: number;
  stripe_subscription_cancelled: boolean;
}

function ConfirmDeleteInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "ready" : "invalid");
  const [result, setResult] = useState<DeletionResult | null>(null);

  const submit = async () => {
    setStatus("submitting");
    try {
      const res = await fetch(
        `${getBackendUrl()}/auth/me?token=${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        const data: DeletionResult = await res.json();
        setResult(data);
        setStatus("deleted");
        // Tear the session down so a hard reload to / lands on the marketing site.
        signOut({ redirect: false }).catch(() => {});
        return;
      }
      const body = await res.json().catch(() => ({}));
      const detail =
        typeof body.detail === "string" ? body.detail.toLowerCase() : "";
      if (res.status === 410) {
        setStatus("consumed");
      } else if (detail.includes("expired")) {
        setStatus("expired");
      } else if (res.status === 400) {
        setStatus("invalid");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl text-center">
        {status === "ready" && (
          <>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-900/40 text-red-400 mb-3">
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-xl font-bold text-white">
              Confirm account deletion
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              This action permanently deletes your tenant, all patterns, jobs,
              API keys, and active sessions. Active paid subscriptions are
              cancelled with no refund. This cannot be undone.
            </p>
            <button
              onClick={submit}
              data-testid="final-delete-button"
              className="mt-6 w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
            >
              Delete my account
            </button>
            <Link
              href="/overview"
              className="mt-3 inline-block text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </Link>
          </>
        )}

        {status === "submitting" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-800 text-gray-400 mb-3 animate-pulse">
              …
            </div>
            <h1 className="text-xl font-bold text-white">
              Deleting your account
            </h1>
            <p className="text-gray-400 mt-2 text-sm">Just a moment.</p>
          </>
        )}

        {status === "deleted" && result && (
          <>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/40 text-green-400 mb-3">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-xl font-bold text-white">Account deleted</h1>
            <p className="text-gray-400 mt-2 text-sm">
              Tenant <span className="font-mono">{result.tenant_id}</span> and
              its data have been removed.
            </p>
            <ul className="mt-4 text-left text-xs text-gray-400 space-y-1">
              <li>Patterns deleted: {result.patterns_deleted}</li>
              <li>API keys revoked: {result.keys_revoked}</li>
              <li>
                Subscription cancelled:{" "}
                {result.stripe_subscription_cancelled ? "yes" : "no"}
              </li>
            </ul>
            <a
              href="https://engramia.dev/?account_deleted=1"
              className="mt-6 inline-block w-full px-4 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Continue
            </a>
          </>
        )}

        {status === "expired" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white mb-3">
              !
            </div>
            <h1 className="text-xl font-bold text-white">Link expired</h1>
            <p className="text-gray-400 mt-2 text-sm">
              This deletion link is more than 24 hours old. Sign in and request
              a new one from <span className="font-mono">Settings → Account</span>.
            </p>
            <Link
              href="/login"
              className="inline-block mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Go to sign in
            </Link>
          </>
        )}

        {status === "consumed" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-600 text-white mb-3">
              ↺
            </div>
            <h1 className="text-xl font-bold text-white">Already used</h1>
            <p className="text-gray-400 mt-2 text-sm">
              This deletion link was already used, or the account has already
              been deleted.
            </p>
            <a
              href="https://engramia.dev/"
              className="inline-block mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Go to engramia.dev
            </a>
          </>
        )}

        {status === "invalid" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white mb-3">
              ✗
            </div>
            <h1 className="text-xl font-bold text-white">
              Invalid deletion link
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              This link isn&apos;t valid. Sign in and request a new one from{" "}
              <span className="font-mono">Settings → Account</span>.
            </p>
            <Link
              href="/login"
              className="inline-block mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Go to sign in
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white mb-3">
              ⚠
            </div>
            <h1 className="text-xl font-bold text-white">
              Couldn&apos;t reach the server
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Please try again in a moment.
            </p>
            <button
              onClick={submit}
              className="mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmDeletePage() {
  return (
    <Suspense fallback={null}>
      <ConfirmDeleteInner />
    </Suspense>
  );
}
