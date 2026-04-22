"use client"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

type Status = "loading" | "success" | "already-verified" | "expired" | "consumed" | "invalid" | "error"

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
        const res = await fetch(`${BACKEND_URL}/auth/verify`, {
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

  // On success, auto-redirect to /login with a prefilled email + "verified" banner
  // after a short delay so the user sees the confirmation.
  useEffect(() => {
    if (status !== "success" && status !== "already-verified") return
    const emailParam = verifiedEmail ? `&email=${encodeURIComponent(verifiedEmail)}` : ""
    const redirectTimer = window.setTimeout(() => {
      window.location.href = `/login?verified=true${emailParam}`
    }, 1500)
    return () => window.clearTimeout(redirectTimer)
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
