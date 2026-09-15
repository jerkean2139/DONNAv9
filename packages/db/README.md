# @donna/db

Authoritative relational schema (Drizzle ORM) and a thin client factory for the
DONNA V2 control plane. Postgres is the **source of truth** for business/product
state; semantic/vector data (Phase 6) is an index over it, never the system of
record (Build Bible V2-005).

## What's here (Phase 1)

- **Tenancy & identity** (`schema/tenancy.ts`): `organizations` (the isolation
  boundary), `users`, `teams`, `memberships` (role-carrying), `projects`.
- **Durable execution** (`schema/execution.ts`): `objectives`, `tasks` (full
  lifecycle + lease/heartbeat/checkpoint/idempotency columns),
  `task_dependencies` (the task graph), `events` (append-only history).
- **Governance** (`schema/governance.ts`): `approvals`, `delegations`,
  `audit_events`, `feature_flags`, `idempotency_keys`.
- Postgres enums mirror `@donna/core-domain` string unions; a drift-guard test
  (`schema.test.ts`) keeps them in lockstep.

Every business-state table carries `organization_id` (multi-tenant from the
schema up, Build Bible V2-025). Access is enforced server-side by the policy
engine (`packages/policy`, Phase 1), with Postgres RLS added later as
defense-in-depth.

## Migrations

Reversible SQL migrations are generated from the schema — no live database
needed to generate:

```bash
pnpm --filter @donna/db db:generate     # generate SQL from schema
pnpm --filter @donna/db db:migrate      # apply (needs DATABASE_URL)
```

Migrations are committed under `migrations/`. **No destructive migration runs
without explicit approval** (Build Bible doc 16 STOP conditions). For local dev,
start the database with `docker compose -f infra/docker/docker-compose.yml up -d`.

## Client

```ts
import { createDatabase } from '@donna/db';
const db = createDatabase(process.env.DATABASE_URL!);
```

The connection string comes from the environment/secrets manager, never from
source (Technical Plan §8). Repositories and query logic live in the services
that own them (control-plane API, worker), added in later Phase 1 work.
