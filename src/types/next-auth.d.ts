import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    tenantId?: string;
    role?: string;
    apiKey?: string;
    // Set true for accounts provisioned via the manual onboarding flow.
    // Middleware redirects authed routes to /change-password until cleared.
    mustChangePassword?: boolean;
  }

  interface User {
    accessToken?: string;
    refreshToken?: string;
    tenantId?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string;
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    role?: string;
    mustChangePassword?: boolean;
  }
}
