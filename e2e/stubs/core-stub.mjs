// Minimal Core API stub used by Dashboard E2E tests in CI.
//
// Why this exists: NextAuth's `authorize` callback and the JWT callback's
// role-detection both run **server-side** inside the Next.js process. They
// hit `${NEXT_PUBLIC_API_URL}/auth/login` and `/auth/me` via Node fetch —
// Playwright's `page.route` only intercepts browser fetches and CANNOT see
// these. So CI needs a real listener at the configured URL.
//
// Scope: only the routes NextAuth and the static auth pages call directly.
// Everything reached from React components (billing, keys, patterns, …)
// is mocked per-spec via `page.route` and does not need a stub.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8000);
const STUB_USER = {
  user_id: "u-stub-1",
  email: process.env.DASHBOARD_TEST_EMAIL ?? "ci-test@engramia.dev",
  password: process.env.DASHBOARD_TEST_PASSWORD ?? "ci-test-password",
  tenant_id: "t-stub-1",
  role: process.env.STUB_ROLE ?? "admin",
};

const ACCESS_TOKEN = "stub-access-token";
const REFRESH_TOKEN = "stub-refresh-token";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authedUser(req) {
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${ACCESS_TOKEN}`) return STUB_USER;
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // CORS — Next.js dev sometimes proxies, dev console hits the API.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (method === "POST" && path === "/auth/login") {
      const body = await readJson(req);
      if (body.email === STUB_USER.email && body.password === STUB_USER.password) {
        return send(res, 200, {
          user_id: STUB_USER.user_id,
          email: STUB_USER.email,
          tenant_id: STUB_USER.tenant_id,
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
        });
      }
      return send(res, 401, { detail: "invalid credentials" });
    }

    if (method === "GET" && path === "/auth/me") {
      const user = authedUser(req);
      if (!user) return send(res, 401, { detail: "unauthorized" });
      return send(res, 200, {
        user_id: user.user_id,
        email: user.email,
        tenant_id: user.tenant_id,
        role: user.role,
      });
    }

    if (method === "POST" && path === "/auth/oauth") {
      return send(res, 200, {
        user_id: STUB_USER.user_id,
        email: STUB_USER.email,
        tenant_id: STUB_USER.tenant_id,
        access_token: ACCESS_TOKEN,
        api_key: "stub-api-key",
      });
    }

    if (method === "POST" && path === "/auth/register") {
      const body = await readJson(req);
      return send(res, 201, {
        user_id: "u-stub-new",
        email: body.email ?? "new@engramia.dev",
        delivery_status: "sent",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
    }

    if (method === "POST" && path === "/auth/verify") {
      const body = await readJson(req);
      // Token-driven branches let `verify/page.tsx` specs assert each state.
      const token = String(body.token ?? "");
      if (token === "expired") return send(res, 400, { detail: "expired", error_code: "expired" });
      if (token === "consumed") return send(res, 410, { detail: "consumed", error_code: "consumed" });
      if (token === "invalid") return send(res, 400, { detail: "invalid", error_code: "invalid" });
      if (token === "boom") return send(res, 500, { detail: "internal error" });
      return send(res, 200, { verified: true, email: STUB_USER.email });
    }

    if (method === "POST" && path === "/auth/resend-verification") {
      return send(res, 200, { delivery_status: "sent" });
    }

    if (method === "POST" && path === "/auth/logout") {
      return send(res, 204, "");
    }

    // Health probe — `next start` waits for upstream to be reachable.
    if (path === "/health" || path === "/") {
      return send(res, 200, { status: "ok", stub: true });
    }

    send(res, 404, { detail: `stub: route not implemented: ${method} ${path}` });
  } catch (err) {
    send(res, 500, { detail: String(err) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[core-stub] listening on http://localhost:${PORT}`);
});
