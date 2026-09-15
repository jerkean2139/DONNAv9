# @donna/worker

The durable-queue worker runtime (Technical Plan §5). graphile-worker provides
the durable job queue — leases, heartbeats, bounded retries and crash-safe
reclamation — so a closed browser or a dead worker never loses an objective
(Build Bible V2-021). It runs enqueued work orders through the orchestrator and
drains the transactional outbox to the event bus.

## Tasks

- **`execute-work-order`** — runs one enqueued work order through
  `@donna/orchestrator` (`executeWorkOrder`): policy gate → Work Router → Model
  Router → cost ledger. This is the composition root — it binds the concrete
  provider adapters and the model registry that the provider-agnostic
  orchestrator receives as dependencies. The orchestrator publishes to a
  **`DrizzleOutboxBus`**, so every transition is recorded in the `events` table
  (the write half of the transactional outbox), never delivered live.
- **`dispatch-outbox`** (scheduled) — drains that outbox to the delivered event
  bus and marks each event dispatched (the read half).

## Pieces

- **`DrizzleOutboxBus`** — write-only `EventBus` whose `publish` inserts an event
  with `dispatched_at = null`; the orchestrator writes here.
- **`DrizzleOutboxStore`** — Postgres-backed `OutboxStore` (from `@donna/events`):
  fetches undispatched events (`dispatched_at IS NULL`) oldest-first and marks
  them dispatched after successful delivery.
- **`createModelAdapterResolver`** — the one place the worker names a provider:
  binds a model id to a concrete `ModelAdapter` (Anthropic today; openai/local
  land later), lazily and cached. Credentials come from the environment (§8).
- **`parseWorkOrder`** — the queue trust boundary: validates an `unknown` job
  payload into a `WorkOrder` (throws `InvalidWorkOrderError` on bad input).
- **`rowToEnvelope` / `envelopeToInsert`** — pure row ↔ `EventEnvelope` mappings
  (unit-tested without a database).
- **`runWorker(config)`** — boots graphile-worker with both tasks. The delivered
  event bus and capability registry are injectable; the production transport and
  capability adapters plug in later.

## Running

```bash
DATABASE_URL=postgresql://donna:donna@localhost:5432/donna pnpm --filter @donna/worker start
```

Bootstrapping real infrastructure (Postgres, background workers) is
integration-tested against a live database — unit CI covers the pure mapping and
the dispatcher logic (in `@donna/events`). The connection string comes from the
environment / secrets manager, never from source (§8).
