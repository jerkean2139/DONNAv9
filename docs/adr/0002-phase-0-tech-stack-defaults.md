# ADR-0002 — Phase 0 technology-stack defaults

- **Date:** 2026-09-15
- **Status:** Accepted
- **Approver:** Jeremy (jeremy@keanonbiz.com) — "use recommended defaults"

## Decision

Adopt the Technical Plan's recommended defaults (plan §1.4, §22) for the
greenfield build:

| Concern            | Choice                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Language           | TypeScript, end to end                                                                     |
| Repo layout        | pnpm workspaces + Turborepo monorepo                                                       |
| Control-plane API  | Node + Fastify (long-running service)                                                      |
| Durable state / DB | Postgres (Supabase) + pgvector, Drizzle ORM                                                |
| Durable jobs/queue | graphile-worker (Postgres-native); Temporal as a documented upgrade path                   |
| Real-time to UI    | SSE / WebSocket fed by the event bus                                                       |
| Auth               | Supabase Auth with MFA + server-side policy checks                                         |
| Web app            | React + Vite + TypeScript + Tailwind + shadcn/ui                                           |
| Local node agent   | Node/TS service exposing OpenAI-compatible inference                                       |
| Private networking | Tailscale-style WireGuard mesh                                                             |
| Secrets            | Dedicated secrets manager (never in source/logs/memory)                                    |
| Observability      | OpenTelemetry + Donna Health                                                               |
| Hosting            | Always-on container host (Fly.io/Railway) for API + workers; Supabase for DB; edge for web |
| Test tooling       | Vitest (unit/integration), Playwright (E2E)                                                |

## Reason

These minimize infrastructure while satisfying the V2 invariants (durable
jobs need long-running workers, so the worker tier is not serverless; Postgres
is the mandated authoritative store; providers stay behind adapters).

## Alternatives considered

- Temporal from day one (deferred — start with graphile-worker, revisit at
  scale). Prisma instead of Drizzle. Next.js instead of Vite SPA. All recorded
  in plan §22 and revisitable via a superseding ADR.

## Consequences

- Phase 0 scaffolds only: monorepo tooling, CI boundary rules, `core-domain`
  types/state machines, dev docker Postgres+pgvector, env/secret conventions,
  and this ADR log. No product behavior, schema, or adapters yet.
- Some §22 open questions remain deferred until the phase that needs them
  (exact model pool/pricing, retention/RPO-RTO, roles→authority mapping,
  integrations priority, voice provider, object storage).

## Affected docs

- `GREENFIELD-V2-TECHNICAL-PLAN.md` §1.4, §22
