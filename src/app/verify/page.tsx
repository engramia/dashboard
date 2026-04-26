"use client"
import { useEffect, useState, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { getBackendUrl } from "@/lib/backend-url"

type Status = "loading" | "success" | "already-verified" | "expired" | "consumed" | "invalid" | "error"

// Stale credentials older than this are ignored (matches the 24h verify token TTL).
const PENDING_CREDS_MAX_AGE_MS = 24 * 60 * 60 * 1000

function VerifyInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [status, setStatus] = useState<Status>("loading")
  const [verifiedEmail, setVerifiedEmail] = useState<string>("")

  useEffect(() => {
    if (!token) {
      setStatus("invalid")
      return
    }
    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          setVerifiedEmail(sessionStorage.getItem("engramia_pending_email") ?? "")
          setStatus(data.email_already_verified ? "already-verified" : "success")
          return
        }
        const body = await res.json().catch(() => ({}))
        const detail = typeof body.detail === "string" ? body.detail.toLowerCase() : ""
        if (detail.includes("expired")) setStatus("expired")
        else if (detail.includes("already been used")) setStatus("consumed")
        else setStatus("invalid")
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token])

  // On success, try to auto-login if the registering browser still has the
  // credentials in sessionStorage. Skips the /login round-trip and lands the
  // user straight on /setup. Falls back to /login (with prefilled email +
  // "verified" banner) when the credentials are missing/stale or auto-login
  // fails — e.g. when the verify link was opened in a different browser.
  useEffect(() => {
    if (status !== "success" && status !== "already-verified") return

    const fallbackToLogin = () => {
      const emailParam = verifiedEmail ? `&email=${encodeURIComponent(verifiedEmail)}` : ""
      window.location.href = `/login?verified=true${emailParam}`
    }

    let raw: string | null = null
    try {
      // localStorage so we survive the new-tab hop most webmail clients
      // (Gmail in particular) take when opening verification links.
      raw = localStorage.getItem("engramia_pending_creds")
    } catch {
      // localStorage unavailable (private mode etc.) — fall back.
    }
    if (!raw) {
      const t = window.setTimeout(fallbackToLogin, 1500)
      return () => window.clearTimeout(t)
    }

    let parsed: { email?: string; password?: string; created_at?: number } | null = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    const fresh = parsed && typeof parsed.created_at === "number"
      && Date.now() - parsed.created_at < PENDING_CREDS_MAX_AGE_MS
    if (!fresh || !parsed?.email || !parsed?.password) {
      try { localStorage.removeItem("engramia_pending_creds") } catch { /* noop */ }
      const t = window.setTimeout(fallbackToLogin, 1500)
      return () => window.clearTimeout(t)
    }

    // Brief delay so the user sees the "Email verified" confirmation before
    // we hand off to /setup.
    const t = window.setTimeout(async () => {
      const result = await signIn("credentials", {
        email: parsed!.email,
        password: parsed!.password,
        redirect: false,
      }).catch(() => null)
      try { localStorage.removeItem("engramia_pending_creds") } catch { /* noop */ }
      if (result?.error || !result?.ok) {
        fallbackToLogin()
        return
      }
      window.location.href = "/setup"
    }, 1500)
    return () => window.clearTimeout(t)
  }, [status, verifiedEmail])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl text-center">
        {status === "loading" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-800 text-gray-400 mb-3">
              …
            </div>
            <h1 className="text-xl font-bold text-white">Confirming your email</h1>
            <p className="text-gray-400 mt-2">Just a moment.</p>
          </>
        )}

        {(status === "success" || status === "already-verified") && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white mb-3">
              ✓
            </div>
            <h1 className="text-xl font-bold text-white">
              {status === "success" ? "Email verified" : "Already verified"}
            </h1>
            <p className="text-gray-400 mt-2">Redirecting you to sign in…</p>
          </>
        )}

        {status === "expired" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white mb-3">
              !
            </div>
            <h1 className="text-xl font-bold text-white">Link expired</h1>
            <p className="text-gray-400 mt-2">
              This verification link is more than 24 hours old. Request a new one from the sign-in page.
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
            <h1 className="text-xl font-bold text-white">Link already used</h1>
            <p className="text-gray-400 mt-2">
              This verification link was already consumed. Sign in to continue.
            </p>
            <Link
              href="/login"
              className="inline-block mt-4 px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Go to sign in
            </Link>
          </>
        )}

        {status === "invalid" && (
          <>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white mb-3">
              ✗
            </div>
            <h1 className="text-xl font-bold text-white">Invalid verification link</h1>
            <p className="text-gray-400 mt-2">
              This link isn&apos;t valid. Request a new verification email from the sign-in page.
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
            <h1 className="text-xl font-bold text-white">Couldn&apos;t reach the server</h1>
            <p className="text-gray-400 mt-2">Please try again in a moment.</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  )
}
