import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { detectRole } from "./lib/auth-helpers"
import { getBackendUrl } from "./lib/backend-url"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        // Resolve at call time so the same image works on both staging and
        // prod via NEXTAUTH_URL — see lib/backend-url.ts. NEXT_PUBLIC_API_URL
        // is build-time-inlined to undefined on our images, which would
        // silently target localhost:8000 from the dashboard container.
        const backendUrl = getBackendUrl()
        try {
          const res = await fetch(`${backendUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })
          if (!res.ok) return null
          const data = await res.json()
          return {
            id: data.user_id,
            email: data.email,
            tenantId: data.tenant_id,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            mustChangePassword: Boolean(data.must_change_password),
          }
        } catch {
          return null
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in via Credentials
      if (user) {
        token.userId = user.id
        token.tenantId = (user as { tenantId?: string }).tenantId
        token.accessToken = (user as { accessToken?: string }).accessToken
        token.refreshToken = (user as { refreshToken?: string }).refreshToken
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
      }
      // OAuth providers — exchange with backend
      if (account?.provider === "google" && account.id_token) {
        try {
          const res = await fetch(`${getBackendUrl()}/auth/oauth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: account.provider,
              provider_token: account.id_token,
              email: token.email,
              name: token.name,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            token.userId = data.user_id
            token.tenantId = data.tenant_id
            token.accessToken = data.access_token
            token.apiKey = data.api_key
          }
        } catch {}
      }
      // Detect role once per session (only on initial sign-in / token refresh)
      const accessToken = token.accessToken as string | undefined
      if (accessToken && !token.role) {
        token.role = await detectRole(accessToken, { backendUrl: getBackendUrl() })
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? ""
      }
      session.tenantId = token.tenantId as string | undefined
      session.accessToken = token.accessToken as string | undefined
      session.apiKey = token.apiKey as string | undefined
      session.role = token.role as string | undefined
      session.mustChangePassword = (token.mustChangePassword as boolean | undefined) ?? false
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  // Staging and prod run behind Caddy, which terminates TLS and forwards
  // the external hostname via Host/X-Forwarded-Host. Auth.js v5 rejects
  // those by default (UntrustedHost) unless we explicitly opt in.
  trustHost: true,
})
