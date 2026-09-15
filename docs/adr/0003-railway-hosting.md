# ADR-0003 — Railway hosting for the control-plane tier

- **Date:** 2026-09-15
- **Status:** Accepted
- **Approver:** Jeremy (provisioned the Railway project + Postgres)

## Decision

Host the always-on control-plane tier on **Railway** (resolving Technical Plan
§22 item 1). Jeremy created a Railway `production` environment with a managed
**Postgres** service (online, with a persistent volume).

**Deployable services** are the two long-running apps:

| Railway service       | Source         | Dockerfile                      | Notes                                             |
| --------------------- | -------------- | ------------------------------- | ------------------------------------------------- |
| `donna-control-plane` | repo root      | `apps/control-plane/Dockerfile` | HTTP API; listens on `PORT`; health `GET /health` |
| `donna-worker`        | repo root      | `apps/worker/Dockerfile`        | durable-queue runtime; needs `DATABASE_URL`       |
| Postgres              | Railway plugin | —                               | authoritative state + pgvector (enable extension) |

Web (`@donna/web`) is a static bundle and deploys to an edge host
(Vercel/Netlify) or a Railway static service — see the runbook.

## Correction (important)

`@donna/policy`, `@donna/events`, `@donna/db` (and `@donna/core-domain`,
`@donna/adapter-base`, `@donna/work-router`) are **libraries**, not services.
They are compiled into `control-plane` and `worker`; they must **not** be
deployed as their own Railway services. See `docs/runbooks/railway-deploy.md`.

## Reason

Durable workers hold leases/heartbeats and run long jobs, so the worker tier
cannot be serverless (Technical Plan §1.4). Railway runs both long-running apps
and managed Postgres in one place, with per-service Dockerfiles for a pnpm
monorepo.

## Consequences

- The cloud control plane + authoritative state live on Railway and stay
  available independent of local compute nodes (V2-016).
- Secrets (`DATABASE_URL`, future provider keys) are set as Railway service
  variables — never committed (Technical Plan §8).
- Applying the DONNA schema migration to the production Postgres is a **prod
  data operation** and requires explicit approval before it runs (Build Bible
  doc 16 STOP conditions); the runbook documents the exact command.

## Affected docs

- `GREENFIELD-V2-TECHNICAL-PLAN.md` §14/§22
- `docs/runbooks/railway-deploy.md`
