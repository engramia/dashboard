"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, MailCheck } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useRequestAccountDeletion } from "@/lib/hooks/useAccount";
import { ApiError } from "@/lib/api";

export default function AccountSettingsPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const tenantId = session?.tenantId ?? "—";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitted, setSubmitted] = useState<{
    expiresAt: string;
    delivery: "sent" | "failed";
  } | null>(null);

  const mutation = useRequestAccountDeletion();

  const handleSubmit = async () => {
    setErrorMsg("");
    try {
      const res = await mutation.mutateAsync(
        reason.trim() ? { reason: reason.trim() } : {},
      );
      setSubmitted({ expiresAt: res.expires_at, delivery: res.delivery_status });
      reset();
    } catch (e) {
      // 409 owner_must_transfer or deletion_already_pending land here too.
      if (e instanceof ApiError) {
        const detail = e.detail;
        // Backend may return either a plain string or an object — flatten both.
        if (typeof detail === "object" && detail !== null) {
          const obj = detail as { error_code?: string; detail?: string };
          if (obj.error_code === "deletion_already_pending") {
            setErrorMsg(
              obj.detail ??
                "A deletion email is already pending. Check your inbox or wait for it to expire.",
            );
          } else if (obj.error_code === "owner_must_transfer") {
            setErrorMsg(
              "You're the owner of a team that has other members. Transfer ownership before deleting your account.",
            );
          } else {
            setErrorMsg(obj.detail ?? "Could not request deletion.");
          }
        } else {
          setErrorMsg(String(detail));
        }
      } else {
        setErrorMsg("Could not reach the server. Please try again.");
      }
    }
  };

  const reset = () => {
    setConfirmOpen(false);
    setConfirmEmail("");
    setReason("");
    setErrorMsg("");
  };

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Account information and self-service controls.
          </p>
        </div>

        <Card>
          <h2 className="text-base font-semibold text-text-primary">
            Account information
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Email</dt>
              <dd className="font-medium text-text-primary">{email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Tenant</dt>
              <dd className="font-mono text-text-primary">{tenantId}</dd>
            </div>
          </dl>
        </Card>

        {/* Danger zone */}
        <Card className="border-red-900/60 bg-red-950/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 text-red-500" size={20} />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-text-primary">
                Danger zone
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Permanently delete your account and all associated data. This
                cannot be undone.
              </p>

              {!submitted && (
                <Button
                  variant="danger"
                  className="mt-4"
                  onClick={() => setConfirmOpen(true)}
                  data-testid="open-delete-modal"
                >
                  Delete account…
                </Button>
              )}

              {submitted && (
                <div
                  className="mt-4 rounded-lg border border-green-900/60 bg-green-950/30 p-4"
                  data-testid="deletion-pending-banner"
                >
                  <div className="flex items-start gap-2">
                    <MailCheck className="mt-0.5 text-green-500" size={18} />
                    <div className="text-sm">
                      <p className="font-medium text-text-primary">
                        {submitted.delivery === "sent"
                          ? "Confirmation email sent"
                          : "Confirmation could not be emailed"}
                      </p>
                      <p className="mt-1 text-text-secondary">
                        {submitted.delivery === "sent"
                          ? `Open the link in your inbox to confirm. The link expires at ${new Date(
                              submitted.expiresAt,
                            ).toLocaleString()}.`
                          : "SMTP is currently unavailable. Try again in a few minutes — your account is unchanged."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        onClose={reset}
        title="Delete account"
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-text-primary">
            <p className="font-semibold">This will permanently delete:</p>
            <ul className="mt-2 list-disc pl-5 text-text-secondary">
              <li>All patterns, embeddings, and async jobs</li>
              <li>All API keys (revoked) and active sessions</li>
              <li>Your tenant and all projects</li>
              <li>Active paid subscription (cancelled, no refund)</li>
            </ul>
          </div>

          <div>
            <label className="block text-text-secondary">
              Type <span className="font-mono text-text-primary">{email}</span> to
              confirm
            </label>
            <Input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2"
              data-testid="confirm-email-input"
            />
          </div>

          <div>
            <label className="block text-text-secondary">
              Optional — why are you leaving?
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              className="mt-2 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-text-primary"
              placeholder="Helps us improve. Visible only to the Engramia team."
              data-testid="reason-input"
            />
          </div>

          {errorMsg && (
            <p
              className="rounded-md bg-red-950/40 px-3 py-2 text-red-300"
              data-testid="delete-error"
            >
              {errorMsg}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirmEmail !== email || mutation.isPending}
              onClick={handleSubmit}
              data-testid="submit-deletion-request"
            >
              {mutation.isPending ? "Sending…" : "Send confirmation email"}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
