# @donna/adapter-ghl

A GoHighLevel (LeadConnector) CRM `CapabilityAdapter` (Technical Plan §7) — the
first **concrete** integration, built on `@donna/adapter-http`. It shapes DONNA's
CRM operations into GHL v2 API calls and inherits the HTTP adapter's guarantees:
bound to the GHL origin (no SSRF), idempotency via `ctx.idempotencyKey`, the
shared error taxonomy, and a request timeout.

```ts
const ghl = new GhlCapabilityAdapter({
  token: process.env.GHL_TOKEN!, // secret from the environment, never source
  locationId: process.env.GHL_LOCATION_ID, // default sub-account
});
await ghl.execute({ op: 'contact.upsert', contact: { email: 'a@b.com', firstName: 'A' } }, ctx);
```

Register it in a `CapabilityCatalog` (`@donna/orchestrator`) with the
`automation` class and `provides: ['crm']`; the Work Router then routes CRM work
to it.

## Operations (`GhlRequest`)

| op               | GHL v2 call                                               |
| ---------------- | --------------------------------------------------------- |
| `contact.upsert` | `POST /contacts/upsert` (create-or-update by email/phone) |
| `contact.get`    | `GET /contacts/:id`                                       |
| `contact.search` | `POST /contacts/search`                                   |
| `message.send`   | `POST /conversations/messages` (SMS / Email)              |

`contact.upsert` and `contact.search` require a `locationId` (the adapter default,
or per-request override) — a missing one is a `GhlConfigError` (`deterministic`,
not retried). Every request carries `Authorization: Bearer <token>` and the GHL
`Version` header.

## Design

The pure `toHttpRequest(req, defaultLocationId)` mapping is the shape of the
integration — tests assert the exact path/method/body **without a live GHL
account**. `GhlCapabilityAdapter` composes an `HttpCapabilityAdapter` bound to
`https://services.leadconnectorhq.com`, so it is not a new HTTP client — it is
the HTTP adapter configured for GHL, with typed operations on top. The token is a
secret supplied at the composition root from the environment (§8).
