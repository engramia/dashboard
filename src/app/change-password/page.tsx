"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { useApiClient } from "@/lib/session";
import { ApiError } from "@/lib/api";

// First-login force-change-password page. Reached either via the dashboard
// middleware redirect (when session.mustChangePassword is true) or explicitly
// from a "Change password" UI control later. After successful change, we
// sign out + back in implicitly via NextAuth's session refresh — but since
// the change-password endpoint returns a fresh access_token without the
// flag, we simply sign out and ask the user to log in with their new
// password (clean slate, single source of truth).
//
// See: Ops/internal/cloud-onboarding-architecture.md (COMP-009).

export default function ChangePasswordPage() {
  const client = useApiClient();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Mirror the server-side complexity rules from
  // engramia/api/cloud_auth.py:ChangePasswordRequest. Surfacing a precise
  // English message client-side avoids two pitfalls: (a) the browser's
  // built-in HTML5 messages are localised to the OS/browser language, and
  // (b) Pydantic's 422 array reaches us late and is awkwardly formatted.
  function clientPasswordComplaint(pw: string): string | null {
    if (pw.length < 8) return "New password must be at least 8 characters.";
    if (!/[A-Z]/.test(pw)) return "New password must contain an uppercase letter.";
    if (!/[a-z]/.test(pw)) return "New password must contain a lowercase letter.";
    if (!/[0-9]/.test(pw)) return "New password must contain a digit.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "New password must contain a special character.";
    return null;
  }

  // FastAPI/Pydantic returns 422 with `detail: [{msg, loc, type, ...}, ...]`,
  // while custom HTTPExceptions in cloud_auth.py raise `detail: {detail: "...",
  // error_code: "..."}`. Either shape lands in ApiError.detail typed as
  // `string` but is actually whatever the server JSON-encoded.
  function extractApiErrorMessage(detail: unknown): string | null {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") {
        // Pydantic v2 prefixes ValueError messages with "Value error, "
        // — strip it for cleaner UX.
        return first.msg.replace(/^Value error,\s*/, "");
      }
    }
    if (detail && typeof detail === "object") {
      const inner = (detail as { detail?: unknown }).detail;
      if (typeof inner === "string") return inner;
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const complaint = clientPasswordComplaint(newPassword);
    if (complaint) {
      setError(complaint);
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from the current password.");
      return;
    }

    setSubmitting(true);
    try {
      if (!client) throw new Error("API client unavailable");
      await client.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setDone(true);
      // Sign out so NextAuth re-issues a fresh JWT (without the flag) on
      // next login. Fire-and-forget; we redirect after a brief confirmation.
      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push("/login?password_changed=1");
      }, 1500);
    } catch (e) {
      let msg = "Could not change password. Please try again.";
      if (e instanceof ApiError) {
        const extracted = extractApiErrorMessage(e.detail);
        if (extracted) msg = extracted;
      }
      setError(msg);
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white mb-3">
            ✓
          </div>
          <h1 className="text-xl font-bold text-white">Password updated</h1>
          <p className="text-gray-400 mt-2">
            Redirecting you to sign in with your new password…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl">
        <div className="mb-6 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white mb-3">
            E
          </div>
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="text-gray-400 mt-2 text-sm leading-relaxed">
            We provisioned your account with a one-time password. Pick a new one before continuing.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* noValidate suppresses HTML5 native validation so the browser does
            not show locale-specific messages (e.g. Czech "Vyplňte alespoň 8
            znaků"). Validation runs in JS via clientPasswordComplaint above. */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Current password (the one we emailed)
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={submitting}
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-10 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              New password
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={submitting}
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters with one uppercase, lowercase, digit, and special character.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Confirm new password
            </label>
            <input
              type={showNew ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={submitting}
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg font-medium transition"
          >
            {submitting ? "Updating…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
