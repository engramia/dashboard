# Engramia Dashboard — Architecture

> Next.js admin UI for the Engramia memory platform.
> Separate application deployed alongside the Core API.

---

## 1. Design Principles

| Principle | Rationale |
|-----------|-----------|
| **API-first** | Every screen is powered by Core `/v1/*` endpoints. Dashboard never touches the DB directly. |
| **RBAC-aware** | UI adapts to the authenticated user's role. Navigation and actions hidden when permission is missing. |
| **Separate deployment** | Own repo, own Dockerfile, own release cycle. Core can evolve without gating on dashboard changes. |
| **Progressive disclosure** | Overview first, then drill-down. Don't overwhelm the operator with every metric at once. |
| **Lightweight** | Minimal dependencies. Tailwind CSS, Recharts, Lucide icons. No heavy component library. |

---

## 2. Technology Stack

- **Next.js 15** (App Router, `output: "standalone"`)
- **React 19**, TypeScript 5.x
- **Tailwind CSS 4** (via `@tailwindcss/postcss`, no `tailwind.config.ts`)
- **NextAuth v5** — Credentials (email/password), Google, GitHub
- **TanStack Query v5** — data fetching + caching
- **Recharts 2** — charts
- **Lucide React** — icons
- **clsx + tailwind-merge** — conditional classes
- **Stripe Checkout** — plan upgrade links (no SDK; hosted URLs via env)

`output: "standalone"` produces a Node.js server bundle, not a static export. The dashboard is deployed as its own container, not bundled into the Core Docker image.

---

## 3. Project Structure

```
dashboard/
├── package.json
├── tsconfig.json
├── next.config.ts            # output: "standalone", trailingSlash, images.unoptimized
├── postcss.config.mjs        # Tailwind v4 via postcss plugin
├── playwright.config.ts      # E2E — project "dashboard", baseURL from DASHBOARD_URL
├── Dockerfile                # Multi-stage: npm ci → npm build → node server.js
├── public/
│   └── favicon.svg
├── e2e/                      # Playwright specs (7 files)
├── fixtures/
│   └── dashboard-auth.ts     # Playwright fixture: NextAuth credentials sign-in
└── src/
    ├── auth.ts               # NextAuth config — Credentials + Google + GitHub
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                       # Root → redirect to overview
    │   ├── api/auth/[...nextauth]/route.ts
    │   ├── login/page.tsx
    │   ├── register/page.tsx              # Email/password signup + Stripe plan
    │   ├── setup/page.tsx                 # Plan selection after registration
    │   ├── overview/page.tsx              # KPI cards + ROI + health
    │   ├── patterns/
    │   │   ├── page.tsx                   # Pattern explorer (search + table)
    │   │   └── detail/page.tsx            # Pattern detail (query-param keyed)
    │   ├── analytics/page.tsx
    │   ├── evaluations/page.tsx
    │   ├── keys/page.tsx
    │   ├── governance/page.tsx
    │   ├── jobs/page.tsx
    │   └── audit/page.tsx                 # admin+ only
    ├── components/
    │   ├── ui/                # Button, Card, Badge, Table, Modal, Input
    │   ├── layout/            # Shell, Sidebar, Topbar
    │   └── charts/            # ROIScoreChart, RecallBreakdown, EvalScoreTrend, ReuseTierPie
    └── lib/
        ├── api.ts             # Typed fetch wrapper (Bearer token from session)
        ├── session.ts         # Session hooks: useApiClient, useRole, useIsAuthenticated, useLogout
        ├── permissions.ts     # Role → permission set (mirrors backend)
        ├── types.ts           # TypeScript types matching API schemas
        └── hooks/             # TanStack Query hooks: useHealth, useMetrics,
                               # useAnalytics, useKeys, useJobs, useGovernance,
                               # usePatterns
```

---

## 4. Authentication

The dashboard uses **NextAuth v5** as the session layer, with three providers:

1. **Credentials** — email/password. `authorize()` calls `POST {BACKEND_URL}/auth/login` on the Core API; on success stores `access_token` + `refresh_token` on the NextAuth session.
2. **Google** — OAuth. On first sign-in the backend creates the user record.
3. **GitHub** — OAuth. Same pattern as Google.

### Flow

1. User hits `/login`. Chooses email/password or an OAuth provider.
2. NextAuth sets a session cookie. The session carries `accessToken`, `tenantId`, `userId`.
3. Protected routes read the session via `auth()` (server) or `useSession()` (client).
4. The API client (`lib/api.ts`) attaches `Authorization: Bearer <accessToken>` to every request to the Core API.
5. New users are routed through `/register` → `/setup` (plan selection + Stripe Checkout URL) → `/overview`.

### Backend dependencies

- `POST /auth/login` — credentials auth, returns `access_token`, `refresh_token`, `user_id`, `tenant_id`, `email`.
- `POST /auth/register` — self-service registration.
- OAuth callbacks reach the backend via NextAuth; mapping user → tenant happens server-side.

`NEXTAUTH_URL` and `NEXTAUTH_SECRET` are required environment variables. See `.env.example`.

---

## 5. Page Overview

| Route | Purpose | Permission |
|-------|---------|------------|
| `/login` | Sign in (credentials / Google / GitHub) | public |
| `/register` | Create account | public |
| `/verify?token=...` | Email verification landing — auto-redirects to /login or /setup | public |
| `/setup` | Plan selection (Sandbox / Pro / Team) + Stripe Checkout | authenticated |
| `/overview` | KPI cards, ROI trend, recall breakdown, system health | `health` |
| `/patterns` | Pattern explorer — semantic search + table | `recall` |
| `/patterns/detail?key=...` | Pattern detail, classify, delete | `recall` (read) / `patterns:delete` + `governance:write` (mutations) |
| `/analytics` | ROI rollups, recall outcomes, top patterns, event stream | `analytics:read` |
| `/evaluations` | Eval score timeline, variance alerts, feedback | `feedback:read` |
| `/keys` | API key CRUD + rotation | `keys:list` (list) / `keys:create`, `keys:rotate`, `keys:revoke` |
| `/governance` | Retention policy, data export, scoped delete | `governance:read` (view) / `governance:write`, `governance:delete` |
| `/jobs` | Async job monitor | `jobs:list` / `jobs:cancel` |
| `/audit` | Audit log viewer | `governance:admin` |
| `/billing` | Plan, usage, Stripe Checkout / Customer Portal | `billing:read` (view) / `billing:manage` (mutations) |
| `/settings/account` | Account info + self-service deletion (GDPR Art. 17) | authenticated (any role) |
| `/account/confirm-delete?token=...` | Final confirmation step from deletion email — public token-bound | public |

Items without permission are hidden from the sidebar by `components/layout/Sidebar.tsx`.

---

## 6. Component Architecture

### Data flow

```
NextAuth session  →  AuthContext  →  TanStack QueryClient  →  hooks  →  api.ts  →  Core /v1/*
```

### API client (`lib/api.ts`)

Typed `fetch` wrapper. Every method returns a promise of a typed response from `lib/types.ts`. Throws `ApiError(status, detail)` on non-2xx.

```typescript
class ApiError extends Error {
  constructor(public status: number, public detail: string, ...)
}
// Usage through hooks; components never call fetch directly.
```

### Permission gating (`lib/permissions.ts`)

Mirrors `engramia/api/permissions.py` role → permission map (`reader`, `editor`, `admin`, `owner`). The sidebar filters nav items and components call `hasPermission(role, perm)` before rendering destructive or privileged actions.

---

## 7. Data Refresh Strategy

| Page | Endpoint | Refresh | Technique |
|------|----------|---------|-----------|
| Overview KPIs | `/v1/metrics` | 30s | `refetchInterval` |
| Overview Health | `/v1/health/deep` | 30s | `refetchInterval` |
| Overview ROI | `/v1/analytics/rollup/daily` | 5min | `staleTime` |
| Analytics Trend | `/v1/analytics/events` | 60s | `staleTime` |
| Patterns | `/v1/recall` (search) | on demand | manual trigger |
| Keys | `/v1/keys` | on mutation | `invalidateQueries` |
| Jobs | `/v1/jobs` | 5s (if running) | conditional `refetchInterval` |
| Governance | `/v1/governance/retention` | on demand | manual |
| Audit | `/v1/audit` | on demand | manual |

---

## 8. RBAC Visibility Matrix

| Page / Action | reader | editor | admin | owner |
|---------------|--------|--------|-------|-------|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Patterns (search) | ✅ | ✅ | ✅ | ✅ |
| Patterns (delete / classify) | — | — | ✅ | ✅ |
| Analytics (view) | ✅ | ✅ | ✅ | ✅ |
| Analytics (trigger rollup) | — | ✅ | ✅ | ✅ |
| Evaluations | ✅ | ✅ | ✅ | ✅ |
| Keys (list / create / rotate / revoke) | — | — | ✅ | ✅ |
| Governance (view) | — | — | ✅ | ✅ |
| Governance (set retention / apply / scoped delete) | — | — | ✅ | ✅ |
| Governance (delete tenant) | — | — | — | ✅ |
| Jobs (view) | ✅ | ✅ | ✅ | ✅ |
| Jobs (cancel) | — | ✅ | ✅ | ✅ |
| Audit log | — | — | ✅ | ✅ |

---

## 9. Deployment

The dashboard ships as its own container image. Next.js `output: "standalone"` produces `.next/standalone/server.js`, which is run under Node.js in the final image.

```
┌─────────────────────┐       ┌──────────────────────┐
│  Dashboard (Node)   │       │  Core API (FastAPI)  │
│  dashboard.*        │──────►│  api.*               │
│  /overview, /keys…  │ Bearer│  /v1/*               │
└─────────────────────┘  CORS └──────────────────────┘
```

- `NEXT_PUBLIC_API_URL` points at the Core API origin.
- `ENGRAMIA_CORS_ORIGINS` on the Core API must include the dashboard origin.
- Production compose and deploy workflow live in [engramia-ops](https://github.com/engramia/engramia-ops).

See [Dockerfile](Dockerfile) for the build stages.

---

## 10. Environment Variables

Defined in `.env.example`. Required in production:

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_URL` | Canonical dashboard origin (e.g. `https://app.engramia.dev`) |
| `NEXTAUTH_SECRET` | Session cookie signing key (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_API_URL` | Core API base URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NEXT_PUBLIC_STRIPE_PRO_URL` / `NEXT_PUBLIC_STRIPE_TEAM_URL` | Stripe Checkout links on `/setup` |
| `DASHBOARD_URL` / `DASHBOARD_API_URL` / `DASHBOARD_API_KEY` | E2E tests (Playwright) |

---

## 11. Visual Design Tokens

```
Colors (dark-first):
  --bg-primary:     #0f1117   (slate-950)
  --bg-surface:     #1a1d27   (slate-900)
  --bg-elevated:    #252832   (slate-800)
  --border:         #2e3241   (slate-700)
  --text-primary:   #e2e8f0   (slate-200)
  --text-secondary: #94a3b8   (slate-400)
  --accent:         #6366f1   (indigo-500 — Engramia brand)
  --success:        #22c55e
  --warning:        #f59e0b
  --danger:         #ef4444

Typography:
  --font-sans:  "Inter", system-ui, sans-serif
  --font-mono:  "JetBrains Mono", "Fira Code", monospace

Spacing: 4px base unit (Tailwind default)
Border radius: 8px (rounded-lg)
```

---

## 12. Non-Goals

- **Real-time WebSocket** — polling is sufficient.
- **Multi-tenant switcher** — dashboard operates in the scope of the authenticated session.
- **User management UI** — tenants/projects managed via API or CLI.
- **i18n** — English only.
- **Offline support** — requires Core API connectivity.
