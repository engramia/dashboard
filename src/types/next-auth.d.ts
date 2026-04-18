import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    tenantId?: string;
    role?: string;
    apiKey?: string;
  }

  interface User {
    accessToken?: string;
    refreshToken?: string;
    tenantId?: string;
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
  }
}
