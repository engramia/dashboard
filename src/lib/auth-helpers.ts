// Pure helpers reused by `src/auth.ts`. Kept separate so unit tests can
// import them without dragging in the entire NextAuth provider tree.

const DEFAULT_ROLE = "reader";

export interface DetectRoleOptions {
  backendUrl: string;
  fetchImpl?: typeof fetch;
}

// Probes Core `/auth/me` to discover the cloud user's role. On any failure
// (network error, non-2xx, malformed JSON, missing `role` field) we fall
// back to the **most restrictive** role. The previous default was `"admin"`,
// which silently elevated readers to admin during a single Core blip — a
// UX-side authz hole even though server-side checks still held.
export async function detectRole(
  accessToken: string,
  opts: DetectRoleOptions,
): Promise<string> {
  const fetcher = opts.fetchImpl ?? fetch;
  try {
    const res = await fetcher(`${opts.backendUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_ROLE;
    const data = (await res.json()) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "role" in data &&
      typeof (data as { role: unknown }).role === "string"
    ) {
      return (data as { role: string }).role;
    }
    return DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}
