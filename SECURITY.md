# Security Policy — Engramia Dashboard

## Reporting Vulnerabilities

If you discover a security vulnerability in the Engramia Dashboard, please
report it responsibly to [support@engramia.dev](mailto:support@engramia.dev)
or open a private GitHub security advisory. Do **not** open a public issue
for security vulnerabilities. You will receive an acknowledgement within 48 hours.

## Scope

The Dashboard is a thin client over the Core API. **Authentication and
authorization are enforced by the Core API** — every request sent from the
dashboard carries a Bearer token that the Core validates server-side.

Roles displayed in the UI are hints used to hide navigation and buttons the
current user cannot use; they are not security boundaries. The Core API is
the source of truth for RBAC. See [Core `SECURITY.md`](https://github.com/engramia/engramia/blob/main/SECURITY.md)
for the full security model, threat assumptions, and known limitations.

## In scope for Dashboard-specific reports

- Cross-site scripting (XSS), clickjacking, or CSRF issues in the dashboard UI.
- Session handling bugs (leaked tokens, improper cookie flags).
- Dependency vulnerabilities that affect the Dashboard build.
- Information disclosure through the Dashboard UI.

## Out of scope

- RBAC enforcement or API authentication — report those against the Core repo.
- Rate limiting, input validation of API payloads — enforced by Core.
