// Force-change-password interceptor for manually-onboarded accounts.
//
// When an account is provisioned through the waitlist flow, the API sets
// `must_change_password=true` on the cloud_users row. The Core /auth/login
// response surfaces that flag in `must_change_password`, which the auth.ts
// jwt+session callbacks stash on `session.mustChangePassword`.
//
// This middleware redirects every authed page request to /change-password
// while the flag is set, so the user can't reach any other UI before
// rotating the one-time password they received in the credentials email.
//
// The /change-password page itself is allowed through, as are auth-API
// callbacks (NextAuth needs them to refresh the session after the password
// change).
//
// See: Ops/internal/cloud-onboarding-architecture.md (COMP-009, ADR-007).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const ALLOW_PREFIXES = [
  "/change-password",
  "/api/auth", // NextAuth handlers
  "/login",
  "/_next",
  "/favicon",
  "/static",
];

function isAllowed(pathname: string): boolean {
  return ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth(async (req: NextRequest & { auth?: unknown }) => {
  const session = (req as unknown as { auth?: { mustChangePassword?: boolean } }).auth;
  const mustChange = Boolean(session?.mustChangePassword);
  if (!mustChange) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isAllowed(pathname)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/change-password";
  return NextResponse.redirect(url);
});

export const config = {
  // Run on every page route except framework internals + static assets.
  // Keep auth API callbacks unblocked so NextAuth can refresh the JWT
  // after /auth/change-password returns a fresh access_token.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
