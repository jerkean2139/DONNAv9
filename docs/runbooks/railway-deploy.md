# Runbook — Railway deployment

How the DONNA control-plane tier deploys on Railway (ADR-0003). Production env
with a managed Postgres already exists.

## TL;DR — what to create

Deploy the **two long-running apps**, not the libraries:

| Create this service   | Dockerfile Path                 | Root Directory  | Needs                               |
| --------------------- | ------------------------------- | --------------- | ----------------------------------- |
| `donna-control-plane` | `apps/control-plane/Dockerfile` | `/` (repo root) | `PORT` (auto), later `DATABASE_URL` |
| `donna-worker`        | `apps/worker/Dockerfile`        | `/` (repo root) | `DATABASE_URL`                      |

Keep the **Postgres** service. **Remove** any services named `@donna/policy`,
`@donna/events`, `@donna/db` — those are libraries, not deployables; they are
built into the two apps above.

## Per-service setup (Railway UI)

For each app service:

1. **Source**: this GitHub repo, branch `main`.
2. **Settings → Build**: Builder = **Dockerfile**; Dockerfile Path as in the
   table. Root Directory = repo root (`/`) so the whole pnpm workspace is in the
   build context.
3. **Settings → Deploy**:
   - `donna-control-plane`: Start command is the image default
     (`node dist/main.js`). Health Check Path = `/health`.
   - `donna-worker`: image default (`node dist/main.js`); no health path (no HTTP).
4. **Variables**:
   - Both: `NODE_ENV=production`.
   - `donna-worker` (and control-plane once it uses the DB): reference the
     Postgres service —
     `DATABASE_URL=${{Postgres.DATABASE_URL}}`
     (use Railway's variable reference so the value is never copied into source).

## One-time database setup

The Postgres needs the `vector` and `pgcrypto` extensions and the DONNA schema.

1. **Extensions** (Railway Postgres → Query, or `psql`):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```
2. **Migrations** — apply the committed Drizzle migrations
   (`packages/db/migrations/`). This is a **production data operation and needs
   explicit approval before running** (Build Bible doc 16). The command:
   ```bash
   DATABASE_URL="<railway postgres url>" pnpm db:migrate
   ```
   Run it as a Railway one-off/CLI command against the service, or locally with
   the production `DATABASE_URL`. It is additive (creates tables/enums); there
   is no existing data to lose on first apply.

graphile-worker installs and manages **its own** job tables automatically on
first worker boot — no manual step for those.

## Web app

`@donna/web` is a static bundle (`pnpm --filter @donna/web build` →
`apps/web/dist`). Recommended: deploy to Vercel/Netlify (edge, Technical Plan
§14). Set `VITE_API_URL` to the `donna-control-plane` public URL at build time.
It can alternatively run as a Railway static service.

## Verifying a deploy

- `donna-control-plane`: `GET https://<service-url>/health` → `{"status":"ok"}`.
- `donna-worker`: logs show graphile-worker started; no crash-loop (a crash-loop
  usually means `DATABASE_URL` is unset).

## Notes / troubleshooting

- The Dockerfiles copy the full built workspace so pnpm's symlinked workspace
  packages resolve at runtime; the image is not size-optimized yet (a
  `pnpm deploy --prod` prune is a later optimization).
- If a Docker build fails on Railway, capture the build log and hand it over —
  these Dockerfiles follow the standard pnpm-monorepo pattern but the build
  can't be exercised from the dev sandbox (no Docker daemon).
- No autoscaling/replica changes, custom domains, or destructive DB operations
  without explicit approval.
