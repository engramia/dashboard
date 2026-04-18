"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsAuthenticated } from "@/lib/session";

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    router.replace(isAuthenticated ? "/overview" : "/login");
  }, [isAuthenticated, router]);

  return null;
}
