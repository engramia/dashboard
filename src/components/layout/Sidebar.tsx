"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  BarChart3,
  FlaskConical,
  Key,
  Shield,
  Cog,
  ScrollText,
  CreditCard,
  Settings,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { useRole } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

// Exported so Sidebar.test.ts can pin the role → visible-items invariant
// without rendering the component (vitest runs in node env, no DOM).
export const NAV_ITEMS = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, perm: "health" },
  { label: "Patterns", href: "/patterns", icon: Brain, perm: "recall" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, perm: "analytics:read" },
  { label: "Evaluations", href: "/evaluations", icon: FlaskConical, perm: "feedback:read" },
  { label: "Keys", href: "/keys", icon: Key, perm: "keys:list" },
  { label: "Governance", href: "/governance", icon: Shield, perm: "governance:read" },
  { label: "Jobs", href: "/jobs", icon: Cog, perm: "jobs:list" },
  { label: "Audit", href: "/audit", icon: ScrollText, perm: "governance:admin" },
  { label: "Billing", href: "/billing", icon: CreditCard, perm: "billing:read" },
  // BYOK — admin+ manages tenant LLM provider credentials (Phase 6.6).
  { label: "LLM Providers", href: "/settings/llm-providers", icon: Sparkles, perm: "credentials:read" },
  // Account self-service (delete, profile) — every logged-in user has "health".
  { label: "Settings", href: "/settings/account", icon: Settings, perm: "health" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const role = useRole();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-lg font-bold" style={{fontFamily: "'Outfit', sans-serif"}}>engram<span className="text-accent">ia</span></span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {NAV_ITEMS.filter((item) => hasPermission(role, item.perm)).map(
          (item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          },
        )}
      </nav>
      <div className="border-t border-border px-5 py-3 text-xs text-text-secondary">
        Engramia Dashboard
      </div>
    </aside>
  );
}
