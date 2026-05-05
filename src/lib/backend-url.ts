// Resolve the Core API origin from the running browser location so a single
// image can serve both staging (app: staging-app.engramia.dev → api: staging-
// api.engramia.dev) and prod (app.engramia.dev → api.engramia.dev) without a
// build-arg split. NEXT_PUBLIC_API_URL is honoured for `npm run dev` and
// unknown hosts so local development still works without bundled defaults.
//
// Server-side (NextAuth's `authorize`, server components, route handlers)
// has no `window`, so we mirror the same explicit hostname mapping using
// NEXTAUTH_URL — which the runtime container env sets per env via compose.
// This keeps the image build-arg-free.

const APP_TO_API: Record<string, string> = {
  "staging-app.engramia.dev": "https://staging-api.engramia.dev",
  "app.engramia.dev": "https://api.engramia.dev",
}

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const mapped = APP_TO_API[window.location.hostname]
    if (mapped) return mapped
  } else {
    const nextauthUrl = process.env.NEXTAUTH_URL
    if (nextauthUrl) {
      try {
        const mapped = APP_TO_API[new URL(nextauthUrl).hostname]
        if (mapped) return mapped
      } catch {
        // malformed NEXTAUTH_URL — fall through to env-var defaults
      }
    }
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
}
