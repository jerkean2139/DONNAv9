# @donna/events

Typed event construction, a transport-agnostic event bus, and the
transactional-outbox pattern (Technical Plan §4.2/§5). The event stream is the
append-only substrate for UI projections, the audit trail, recovery/replay and
observability.

## Pieces

- **`createEvent()`** — builds a well-formed `EventEnvelope` (from
  `@donna/core-domain`): generates the event id and, when omitted, a fresh
  correlation id; injectable clock; optional fields omitted, never `undefined`.
  Payloads are referenced (`payloadRef`), never inlined — secrets never enter
  the event body (§8).
- **`EventBus` + `InMemoryEventBus`** — subscribe by event type or `'*'`;
  a throwing handler is isolated so it never blocks delivery to others. The
  production transport (Postgres `LISTEN/NOTIFY` / Supabase Realtime) is added
  as an adapter without changing consumers.
- **Transactional outbox** — `OutboxStore` persists an event in the _same_
  transaction as the state change that produced it (no state change without its
  event, no phantom events). `OutboxDispatcher` delivers persisted events to the
  bus and marks them published only after successful delivery, so a failure
  retries next batch. Delivery is **at-least-once**; downstream side effects
  dedupe via idempotency keys (V2-021). `InMemoryOutboxStore` backs tests; the
  Drizzle/Postgres store lands with the worker runtime.

## Boundaries

Pure logic: depends only on `@donna/core-domain` and Node's `crypto`. No
database, no provider SDKs, no network. The concrete Postgres-backed
`OutboxStore` and bus transport are wired in by the services that own them.
