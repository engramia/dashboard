import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function detectRole(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    if (res.ok) {
      const data = await res.json()
      if (typeof data.role === "string") return data.role
    }
  } catch {
    // fall through
  }
  return "admin"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const res = await fetch(`${BACKEND_URL}/auth/login`, {
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
      }
      // OAuth providers — exchange with backend
      if (account?.provider === "google" && account.id_token) {
        try {
          const res = await fetch(`${BACKEND_URL}/auth/oauth`, {
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
        token.role = await detectRole(accessToken)
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
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
})
