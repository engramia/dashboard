// NEXT_PUBLIC_* env values are inlined at build time, so a single image can
// not be re-pointed at different Stripe links per environment without a
// dedicated build-arg split. The fallbacks point to the staging test-mode
// payment links so a freshly-built image is usable on staging without
// dedicated build args. Production builds override via
// NEXT_PUBLIC_STRIPE_PRO_URL / NEXT_PUBLIC_STRIPE_TEAM_URL build args
// before publishing the prod image.

const STAGING_STRIPE_PRO_URL = "https://buy.stripe.com/test_dRm28rf9S2secD50O5enS00"
const STAGING_STRIPE_TEAM_URL = "https://buy.stripe.com/test_00w3cv1j29UG46zdARenS03"

export const STRIPE_PRO_URL = process.env.NEXT_PUBLIC_STRIPE_PRO_URL ?? STAGING_STRIPE_PRO_URL
export const STRIPE_TEAM_URL = process.env.NEXT_PUBLIC_STRIPE_TEAM_URL ?? STAGING_STRIPE_TEAM_URL

export function stripeCheckoutUrl(planId: "pro" | "team", email: string, tenantId: string): string {
  const base = planId === "pro" ? STRIPE_PRO_URL : STRIPE_TEAM_URL
  const params = new URLSearchParams()
  if (email) params.set("prefilled_email", email)
  if (tenantId) params.set("client_reference_id", tenantId)
  return `${base}?${params.toString()}`
}
