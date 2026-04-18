# Engramia Dashboard

Next.js admin dashboard for managing [Engramia](https://github.com/engramia/engramia) instances —
pattern browser, evaluation results, API key management, audit log, governance controls, and ROI analytics.

## Stack

TypeScript 5 · React 19 · Next.js 15 (App Router) · Tailwind CSS 4 · Recharts 2 · NextAuth v5

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details (auth flow, RBAC, deployment).

## Development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

## Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t engramia-dashboard .
docker run -p 3000:3000 --env-file .env.local engramia-dashboard
```

## Configuration

See [.env.example](.env.example) for required environment variables.
Dashboard connects to an Engramia API instance via `NEXT_PUBLIC_API_URL`.

## License

Source available under [BSL 1.1](./LICENSE.txt). Converts to Apache 2.0 on 2030-04-05.

## Related

- [engramia/engramia](https://github.com/engramia/engramia) — core library, REST API, MCP server
- [engramia.dev](https://engramia.dev) — project website
