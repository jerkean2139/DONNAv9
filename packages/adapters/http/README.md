# @donna/adapter-http

A real HTTP `CapabilityAdapter` (Technical Plan §7) — the `automation` execution
class, and the outbound counterpart to the deterministic
`@donna/adapter-capability-fn`. It makes actual network requests behind the
adapter contract, so the orchestrator runs it exactly like any capability.

```ts
const crm = new HttpCapabilityAdapter({
  id: 'crm.http',
  provides: ['crm'],
  baseUrl: 'https://api.example.com', // fixed origin
  defaultHeaders: { authorization: `Bearer ${process.env.CRM_TOKEN}` }, // auth from env
});
// a work order supplies only the path/method/body:
await crm.execute({ path: '/contacts', method: 'POST', body: { name: 'A' } }, ctx);
```

Register it in a `CapabilityCatalog` (`@donna/orchestrator`) with the
`automation` class; the Work Router then routes matching work to it.

## Safe by construction

- **Bound to a fixed base URL.** A work order provides the path, method, query
  and body — never a host. A path that resolves to a different origin is rejected
  (`HttpInvalidTargetError`), so an order cannot redirect the call to internal
  services or a metadata endpoint (no SSRF).
- **Auth stays out of the order.** Credentials live in `defaultHeaders`, set from
  the environment / secrets manager, never in the work order or in memory (§8).
- **Idempotent.** `ctx.idempotencyKey` is sent as `Idempotency-Key`, so a retried
  call does not duplicate a side effect.
- **One error taxonomy.** Transport and HTTP failures map to the shared
  `ErrorClass` (429 → `rate_limit`, 401/403 → `auth`, 5xx → `unavailable`, other
  4xx → `deterministic`, network/timeout → `transient`), so the orchestrator's
  retry/fallback logic lives in one place.
- **Bounded.** Each call has a timeout (default 30s) via `AbortController` and
  honors an external `ctx.signal`.

## Concrete integrations

GHL, Apollo, and other REST services are this adapter configured with their base
URL + auth (or a thin subclass that shapes the path/body). No provider SDK — the
platform `fetch` is used (injectable for tests).

Tests cover the unit behavior with an injected fetch **and** real network I/O
against an in-process HTTP server (GET/POST, idempotency propagation, a real 500).
