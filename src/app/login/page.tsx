"use client"
import { signIn } from "next-auth/react"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { getBackendUrl } from "@/lib/backend-url"

function LoginInner() {
  const searchParams = useSearchParams()
  const initialEmail = searchParams.get("email") ?? ""
  const verifiedBanner = searchParams.get("verified") === "true"

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendDone, setResendDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setNeedsVerification(false)
    setResendDone(false)

    // Probe Core directly first so we can distinguish 403 email_not_verified from
    // the generic "invalid credentials" that NextAuth's Credentials provider returns.
    try {
      const probe = await fetch(`${getBackendUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (probe.status === 403) {
        const body = await probe.json().catch(() => ({}))
        const code = body?.error_code ?? body?.detail?.error_code
        if (code === "email_not_verified") {
          setNeedsVerification(true)
          setLoading(false)
          return
        }
      }
      if (!probe.ok) {
        setError("Invalid email or password")
        setLoading(false)
        return
      }
    } catch {
      setError("Network error — please try again")
      setLoading(false)
      return
    }

    // Credentials are valid and email is verified — hand off to NextAuth for session.
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    if (result?.error) {
      setError("Invalid email or password")
      setLoading(false)
      return
    }
    // /verify might have stashed credentials for same-browser auto-login;
    // clear them once a real login has succeeded so they don't linger past
    // the verification window.
    try { localStorage.removeItem("engramia_pending_creds") } catch { /* noop */ }
    // Where to go next:
    //   1. Marketing chose a plan (?plan=...) -> /setup so Stripe checkout fires
    //   2. Brand-new user (just registered, /setup never completed) -> /setup
    //      "Welcome -> Get started" walks them through plan + API key
    //   3. Returning user -> /overview
    const pendingPlan = sessionStorage.getItem("engramia_pending_plan")
      || localStorage.getItem("engramia_pending_plan")
    const isFreshUser = !!localStorage.getItem("engramia_new_api_key")
    window.location.href = (pendingPlan || isFreshUser) ? "/setup" : "/overview"
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await fetch(`${getBackendUrl()}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setResendDone(true)
    } catch {
      // Swallow — resend endpoint is enumeration-silent by design.
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl">
        <div className="mb-8 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white mb-3">
            E
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-400 mt-1">Sign in to your Engramia account</p>
        </div>

        {verifiedBanner && (
          <div className="mb-4 p-3 rounded-lg bg-green-900/30 border border-green-800 text-green-200 text-sm">
            Email verified — sign in to continue.
          </div>
        )}

        {/* Google */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/overview" })}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-50 transition mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-900 px-2 text-gray-500">or</span>
          </div>
        </div>

        {/* Email/Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-elevated border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 pr-10 bg-elevated border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-200 rounded"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {needsVerification && (
            <div className="p-3 rounded-lg bg-yellow-900/30 border border-yellow-800 text-yellow-200 text-sm space-y-2">
              <p>Please verify your email before signing in. Check your inbox for the link we sent.</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendDone}
                className="w-full py-1.5 bg-yellow-800/50 hover:bg-yellow-800 disabled:opacity-60 text-yellow-100 rounded font-medium transition text-xs"
              >
                {resending ? "Sending…" : resendDone ? "Sent — check your inbox" : "Resend verification email"}
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg font-medium transition"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-accent hover:text-accent/80">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
