# @donna/worker

The durable-queue worker runtime (Technical Plan §5). graphile-worker provides
the durable job queue — leases, heartbeats, bounded retries and crash-safe
reclamation — so a closed browser or a dead worker never loses an objective
(Build Bible V2-021). A scheduled `dispatch-outbox` task drains the
transactional outbox to the event bus.

## Pieces

- **`DrizzleOutboxStore`** — Postgres-backed `OutboxStore` (from `@donna/events`):
  fetches undispatched events (`dispatched_at IS NULL`) oldest-first and marks
  them dispatched after successful delivery.
- **`rowToEnvelope`** — pure row → `EventEnvelope` mapping (unit-tested without a
  database).
- **`runWorker(config)`** — boots graphile-worker with the outbox dispatch task.
  The event bus is injectable; the production transport plugs in later.

## Running

```bash
DATABASE_URL=postgresql://donna:donna@localhost:5432/donna pnpm --filter @donna/worker start
```

Bootstrapping real infrastructure (Postgres, background workers) is
integration-tested against a live database — unit CI covers the pure mapping and
the dispatcher logic (in `@donna/events`). The connection string comes from the
environment / secrets manager, never from source (§8).
