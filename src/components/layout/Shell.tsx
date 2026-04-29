"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DemoModeBanner } from "./DemoModeBanner";

export function Shell({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  // status is one of "loading" | "authenticated" | "unauthenticated".
  // Only redirect when the session has been resolved AND is absent —
  // redirecting during "loading" would race the cookie hydration that
  // follows signIn() and bounce the user back to /login even though
  // they just authenticated.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <DemoModeBanner />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
