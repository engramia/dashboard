"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { getBackendUrl } from "@/lib/backend-url"
import { useApiClient } from "@/lib/session"
import { useBillingStatus, useCreateCheckoutSession } from "@/lib/hooks/useBilling"
import {
  DEFAULT_INTERVAL,
  PLAN_PRICING,
  parseIntervalParam,
} from "@/lib/stripe-checkout"
import type { BillingInterval, BillingPlan } from "@/lib/types"

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://engramia.dev/docs"

type PlanId = "developer" | BillingPlan

interface PlanCard {
  id: PlanId
  name: string
  description: string
  features: string[]
  cta: string
  highlight: boolean
  paid: boolean
}

const PLANS: PlanCard[] = [
  {
    id: "developer",
    name: "Developer",
    description: "Free tier for hobby and adoption",
    features: ["2 projects", "5,000 eval runs/mo", "10k patterns", "BYOK + community support"],
    cta: "Continue free",
    highlight: false,
    paid: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Solo dev in production",
    features: ["10 projects", "50,000 eval runs/mo", "100k patterns", "Analytics + evolution + webhooks"],
    cta: "Start Pro",
    highlight: false,
    paid: true,
  },
  {
    id: "team",
    name: "Team",
    description: "Production team with governance",
    features: ["50 projects", "250,000 eval runs/mo", "1M patterns", "RBAC + audit + async + hosted MCP"],
    cta: "Start Team",
    highlight: true,
    paid: true,
  },
  {
    id: "business",
    name: "Business",
    description: "Organisation scale",
    features: ["250 projects", "1M eval runs/mo", "10M patterns", "SSO + cross-agent memory + role routing"],
    cta: "Start Business",
    highlight: false,
    paid: true,
  },
]

export default function SetupPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const client = useApiClient()
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState("")
  const [copied, setCopied] = useState(false)
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_INTERVAL)
  const [checkoutError, setCheckoutError] = useState<string>("")
  const { data: billing } = useBillingStatus()
  const checkoutMutation = useCreateCheckoutSession()
  // Track whether we are in the middle of provisioning the waitlist user's
  // first API key so the welcome screen shows a spinner instead of a blank
  // "Get started" button — failures are surfaced inline.
  const [provisioningKey, setProvisioningKey] = useState(false)
  const [provisionError, setProvisionError] = useState("")
  // Drives step 2 to show a plan acknowledgement (the operator already
  // picked the plan via `engramia waitlist approve --plan <tier>`) instead
  // of the picker that /register users see. Hydrated from the persistent
  // localStorage origin flag so refresh / re-mount during onboarding
  // doesn't lose the signal — the volatile pending-first-setup flag is
  // consumed on first hit, so it can't carry the bit any further on its
  // own. Declared up here (above the first useEffect that depends on it)
  // because TypeScript catches use-before-declare across closures.
  const [arrivedFromWaitlist, setArrivedFromWaitlist] = useState(false)

  // After Stripe checkout succeeds, the Payment Link redirects back to this
  // page (its default success URL). Without a server-side check we'd just
  // rerender step 1 and the user would loop through "Welcome -> pick a plan".
  //
  // Two cases when the wizard has nothing more to ask:
  //   - Fresh registration that just paid: jump to step 3 so they actually
  //     see the API key + quick-start snippet (the api_key is stashed in
  //     localStorage by /register and cleared on the "Go to Dashboard" button).
  //   - Returning user with an active subscription: skip setup entirely and
  //     replace the route with /overview so they don't accidentally re-enter
  //     setup from a stale tab.
  //
  // The first poll right after Stripe redirect may still see plan_tier
  // ="developer" (or the legacy "sandbox" alias) — webhook is async —
  // useBillingStatus refetches on its standard stale window, so the
  // effect re-fires once the row catches up.
  useEffect(() => {
    if (!billing) return
    // Waitlist / test-onboard users land here mid-flow with the same
    // active+paid signal a returning user has — but they are NOT done
    // with onboarding (the inline createKey is still in flight, the
    // ack panel + quickstart hasn't been shown). The "active+paid →
    // skip to /overview" redirect below is meant only for returning
    // users who navigated into /setup by mistake. Bail early so the
    // wizard runs end-to-end for waitlist users.
    if (arrivedFromWaitlist) return

    const isFreeTier =
      billing.plan_tier === "sandbox" || billing.plan_tier === "developer"
    const isActivePaid =
      billing.plan_tier && !isFreeTier && billing.status === "active"
    if (!isActivePaid) return

    let hasFreshKey = false
    try {
      hasFreshKey = !!(
        localStorage.getItem("engramia_new_api_key")
        || sessionStorage.getItem("engramia_new_api_key")
      )
    } catch {
      /* noop */
    }
    if (hasFreshKey) {
      setStep(3)
      return
    }
    router.replace("/overview")
  }, [billing, router, arrivedFromWaitlist])

  const handlePlanSelect = async (plan: PlanCard) => {
    if (!plan.paid) {
      setStep(3)
      return
    }
    setCheckoutError("")
    try {
      const email = session?.user?.email ?? ""
      const origin = window.location.origin
      const res = await checkoutMutation.mutateAsync({
        plan: plan.id as BillingPlan,
        interval,
        success_url: `${origin}/setup?checkout=success`,
        cancel_url: `${origin}/setup?checkout=cancelled`,
        ...(email ? { customer_email: email } : {}),
      })
      window.location.href = res.checkout_url
    } catch (e) {
      setCheckoutError(
        e instanceof Error ? e.message : "Couldn't start the Stripe checkout.",
      )
    }
  }

  useEffect(() => {
    // Hydrate the waitlist-origin signal from localStorage first. This
    // survives refresh / new-tab navigation through the rest of the
    // wizard. We clear it in the step-4 buttons (alongside the api_key)
    // so a returning user landing on /setup again later sees the picker.
    if (localStorage.getItem("engramia_setup_origin") === "waitlist") {
      setArrivedFromWaitlist(true)
    }

    // Read from both stores — register now writes localStorage so the value
    // survives Gmail's new-tab hop on the verify link, but legacy sessions
    // may still hold it in sessionStorage.
    const key = localStorage.getItem("engramia_new_api_key")
      ?? sessionStorage.getItem("engramia_new_api_key")
      ?? ""
    if (key) {
      setApiKey(key)
      return
    }
    // Waitlist-onboarded path: /change-password sets this flag right before
    // signing the user out. They re-authenticate, /login routes them here,
    // and /setup creates their first key inline so the plaintext only ever
    // lives in their browser. Operator never sees it (CLI shows "not
    // provisioned" instead of the plaintext).
    const needsFirstSetup =
      localStorage.getItem("engramia_pending_first_setup") === "1"
    if (!needsFirstSetup || !client) return

    // Consume the volatile flag immediately so a refresh during the call
    // does not double-create. The persistent `engramia_setup_origin` flag
    // below carries the "this is a waitlist onboarding" bit through the
    // rest of the wizard.
    localStorage.removeItem("engramia_pending_first_setup")
    localStorage.setItem("engramia_setup_origin", "waitlist")
    setArrivedFromWaitlist(true)
    setProvisioningKey(true)
    void (async () => {
      try {
        const res = await client.createKey({ name: "Default API Key" })
        if (res.key) {
          localStorage.setItem("engramia_new_api_key", res.key)
          setApiKey(res.key)
        } else {
          setProvisionError(
            "API key was created but the plaintext was missing from the response.",
          )
        }
      } catch (e) {
        setProvisionError(
          e instanceof Error ? e.message : "Could not provision your first API key.",
        )
      } finally {
        setProvisioningKey(false)
      }
    })()
  }, [client])

  useEffect(() => {

    // Honour ?plan=X chosen on the marketing site: skip the welcome step and
    // either jump to a Stripe checkout (Pro/Team) or land on the API key step
    // (Sandbox). The sessionStorage entry is one-shot to avoid re-triggering
    // on every visit.
    const pendingPlan = sessionStorage.getItem("engramia_pending_plan")
    const pendingInterval = sessionStorage.getItem("engramia_pending_interval")
    if (pendingInterval) {
      const parsed = parseIntervalParam(pendingInterval)
      setInterval(parsed)
      sessionStorage.removeItem("engramia_pending_interval")
    }
    if (!pendingPlan) return
    sessionStorage.removeItem("engramia_pending_plan")

    const target = PLANS.find(p => p.id === pendingPlan)
    if (!target) return
    if (target.paid) {
      // Wait until session is hydrated so customer_email is populated.
      setStep(2)
      sessionStorage.setItem("engramia_pending_redirect_plan", target.id)
    } else {
      setStep(3)
    }
  }, [])

  // Trigger the Stripe redirect once the session is loaded — needed so the
  // POST /v1/billing/checkout request carries customer_email.
  useEffect(() => {
    const pendingRedirectPlan = sessionStorage.getItem("engramia_pending_redirect_plan")
    if (!pendingRedirectPlan || !session?.user?.email) return
    sessionStorage.removeItem("engramia_pending_redirect_plan")
    const target = PLANS.find(p => p.id === pendingRedirectPlan)
    if (target) void handlePlanSelect(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email])

  const copy = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? "bg-accent text-white" : "bg-gray-800 text-gray-500"}`}>{s}</div>
              {s < 4 && <div className={`w-12 h-0.5 ${step > s ? "bg-accent" : "bg-gray-800"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🧠</div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to Engramia</h1>
            <p className="text-gray-400 mb-8">Your agents are about to get smarter. Let&apos;s get you set up in 2 minutes.</p>
            {provisioningKey && (
              <p className="text-sm text-gray-500 mb-6">Provisioning your first API key…</p>
            )}
            {provisionError && (
              <div className="mb-6 mx-auto max-w-md p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-200 text-sm">
                {provisionError} You can still continue and create one later from the Keys page.
              </div>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={provisioningKey}
              className="px-8 py-3 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-lg transition"
            >
              {provisioningKey ? "Just a second…" : "Get started →"}
            </button>
          </div>
        )}

        {/* Step 2 (waitlist path): plan acknowledgement.
            The operator already chose the plan via `engramia waitlist
            approve --plan <tier>`, so showing a picker would either
            confuse the user (they were promised X) or create a costly
            mistake (they accidentally pick Developer, downgrading
            themselves out of a paid pilot). Show the assigned plan as
            a confirmation card and a Continue button. */}
        {step === 2 && arrivedFromWaitlist && (() => {
          const tier = billing?.plan_tier ?? "developer"
          // PLANS covers developer/pro/team/business; fall back for
          // enterprise (and any future tier) so the panel still renders.
          const fallback: { name: string; description: string; features: string[] } = {
            name: tier.charAt(0).toUpperCase() + tier.slice(1),
            description: "Provisioned for you by the Engramia team",
            features: [],
          }
          const detail = PLANS.find(p => p.id === tier) ?? fallback
          return (
            <div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                You&apos;re on the {detail.name} plan
              </h2>
              <p className="text-gray-400 text-center mb-8">
                Provisioned for you by the Engramia team — no payment step needed.
              </p>

              <div className="max-w-md mx-auto p-6 rounded-xl border border-accent bg-accent/10 mb-8">
                <div className="text-xl font-bold text-white">{detail.name}</div>
                <div className="text-sm text-gray-400 mt-1 mb-4">{detail.description}</div>
                {detail.features.length > 0 && (
                  <ul className="space-y-1">
                    {detail.features.map(f => (
                      <li key={f} className="text-sm text-gray-300 flex gap-2">
                        <span className="text-green-400">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="text-center">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium transition"
                >
                  Continue →
                </button>
                <p className="text-xs text-gray-500 mt-3">
                  You can upgrade or downgrade later from Settings &rarr; Billing.
                </p>
              </div>
            </div>
          )
        })()}

        {/* Step 2 (register path): plan picker. */}
        {step === 2 && !arrivedFromWaitlist && (
          <div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">Choose your plan</h2>
            <p className="text-gray-400 text-center mb-6">You can upgrade or downgrade at any time</p>

            <div className="flex justify-center mb-8">
              <div className="inline-flex rounded-lg bg-gray-800 p-1" role="tablist" aria-label="Billing interval">
                {(["yearly", "monthly"] as BillingInterval[]).map(value => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={interval === value}
                    onClick={() => setInterval(value)}
                    className={`px-4 py-1.5 text-sm rounded-md transition ${
                      interval === value
                        ? "bg-accent text-white"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    {value === "yearly" ? "Yearly · save 25%" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLANS.map(plan => {
                const pricing = plan.paid
                  ? PLAN_PRICING[plan.id as BillingPlan][interval]
                  : { display: "Free", sub: "" }
                const disabled = plan.paid && checkoutMutation.isPending
                return (
                  <div key={plan.id} className={`p-6 rounded-xl border ${plan.highlight ? "border-accent bg-accent/10" : "border-gray-800 bg-gray-900"}`}>
                    {plan.highlight && <div className="text-xs text-accent font-medium mb-2 uppercase tracking-wide">Most popular</div>}
                    <div className="text-xl font-bold text-white">{plan.name}</div>
                    <div className="mt-1 mb-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">{pricing.display}</span>
                      {pricing.sub && <span className="text-sm text-gray-400">{pricing.sub}</span>}
                    </div>
                    <div className="text-sm text-gray-400 mb-4">{plan.description}</div>
                    <ul className="space-y-1 mb-6">
                      {plan.features.map(f => <li key={f} className="text-sm text-gray-300 flex gap-2"><span className="text-green-400">✓</span>{f}</li>)}
                    </ul>
                    <button
                      onClick={() => void handlePlanSelect(plan)}
                      disabled={disabled}
                      className={`w-full py-2 rounded-lg font-medium transition text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                        plan.highlight ? "bg-accent hover:bg-accent/80 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                      }`}
                    >
                      {disabled ? "Opening checkout…" : plan.cta}
                    </button>
                  </div>
                )
              })}
            </div>
            {checkoutError && (
              <p className="mt-4 text-center text-sm text-red-400">{checkoutError}</p>
            )}
          </div>
        )}

        {/* Step 3: API key + Quick Guide */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">You&apos;re all set! 🎉</h2>
            <p className="text-gray-400 text-center mb-8">Here&apos;s your API key — save it somewhere safe</p>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <div className="text-sm text-gray-400 mb-2">Your API key</div>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-green-400 font-mono text-sm bg-gray-950 px-3 py-2 rounded-lg break-all">
                  {apiKey || "engramia-••••••••••••••••"}
                </code>
                <button onClick={copy} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition shrink-0">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">This key won&apos;t be shown again. You can generate a new one in the Keys section.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <div className="text-sm text-gray-400 mb-3">Quick start</div>
              <pre className="text-sm text-gray-300 overflow-x-auto"><code>{`pip install engramia

from engramia import EngramiaClient

client = EngramiaClient(
    api_key="${apiKey || "YOUR_API_KEY"}",
    base_url="${getBackendUrl()}"
)

# Store what worked
client.learn("use_retry_logic", {"pattern": "retry 3x with backoff"}, eval_score=0.95)

# Recall later
results = client.recall("retry pattern")`}</code></pre>
            </div>

            <div className="flex gap-4 justify-center">
              <a href={DOCS_URL} className="px-6 py-2.5 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 transition text-sm">
                Read the docs
              </a>
              <button
                onClick={() => setStep(4)}
                className="px-6 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium transition"
              >
                Next: add LLM key →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Add LLM key (BYOK) — optional, can be skipped */}
        {step === 4 && (
          <div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Bring your own LLM key
            </h2>
            <p className="text-gray-400 text-center mb-8">
              Engramia uses your OpenAI / Anthropic / Gemini key for evaluations.
              You control the costs, the model, and the provider — Engramia
              never holds your billing relationship.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl">🔑</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white mb-1">
                    Add your API key
                  </div>
                  <p className="text-sm text-gray-400">
                    Open the LLM Providers page in the dashboard. The key is
                    encrypted at rest with AES-256-GCM and never echoed back —
                    you keep your own copy.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2 text-center transition"
                >
                  OpenAI keys ↗
                </a>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2 text-center transition"
                >
                  Anthropic keys ↗
                </a>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2 text-center transition"
                >
                  Gemini keys ↗
                </a>
              </div>

              {/* Escape hatch into the full BYOK page — the three quick-links
                  above are an opinionated shortlist (the providers Engramia
                  documents end-to-end). The /settings/llm-providers page
                  exposes the rest: Ollama for local models, custom
                  OpenAI-compatible endpoints, per-role routing, failover
                  chain, role cost ceilings (Business+). */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem("engramia_new_api_key")
                      sessionStorage.removeItem("engramia_new_api_key")
                      localStorage.removeItem("engramia_setup_origin")
                    } catch {
                      /* noop */
                    }
                    router.push("/settings/llm-providers")
                  }}
                  className="text-xs text-gray-400 hover:text-accent underline underline-offset-4 transition"
                >
                  More options (Ollama, custom endpoints, per-role routing) →
                </button>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <div className="text-yellow-400 text-lg leading-6">⚠</div>
                <div className="flex-1 text-sm text-yellow-100">
                  <div className="font-semibold text-yellow-200 mb-1">
                    Skip for now → demo mode
                  </div>
                  <p>
                    You can skip this step and Engramia will return simulated
                    responses (50 calls/month) so you can explore the UI. Real
                    evaluations require a key — add one any time from{" "}
                    <span className="font-mono text-yellow-200">
                      Settings → LLM Providers
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("engramia_new_api_key")
                    sessionStorage.removeItem("engramia_new_api_key")
                    // The user has finished onboarding; if they ever come
                    // back to /setup later (e.g. via a deep link) they
                    // should see the standard /register-style picker, not
                    // the waitlist acknowledgement.
                    localStorage.removeItem("engramia_setup_origin")
                  } catch {
                    /* noop */
                  }
                  router.push("/overview")
                }}
                className="px-6 py-2.5 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 transition text-sm"
              >
                Skip for now → demo mode
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("engramia_new_api_key")
                    sessionStorage.removeItem("engramia_new_api_key")
                    localStorage.removeItem("engramia_setup_origin")
                  } catch {
                    /* noop */
                  }
                  router.push("/settings/llm-providers")
                }}
                className="px-6 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium transition"
              >
                Add LLM key →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
