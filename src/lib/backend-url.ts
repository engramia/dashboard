// Resolve the Core API origin from the running browser location so a single
// image can serve both staging (app: staging-app.engramia.dev → api: staging-
// api.engramia.dev) and prod (app.engramia.dev → api.engramia.dev) without a
// build-arg split. NEXT_PUBLIC_API_URL is honoured for `npm run dev` and
// unknown hosts so local development still works without bundled defaults.

export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname
    if (host === "staging-app.engramia.dev") return "https://staging-api.engramia.dev"
    if (host === "app.engramia.dev") return "https://api.engramia.dev"
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
}
