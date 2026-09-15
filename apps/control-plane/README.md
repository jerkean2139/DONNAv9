# @donna/control-plane

Control-plane API skeleton (Technical Plan §4.1). Fastify service wiring request
identity → deterministic policy → objective/task state → event outbox. Every
mutating route runs `@donna/policy`'s `evaluate()` before touching state; the
decision is server-side and cannot be bypassed (Build Bible V2-009).

## Routes (skeleton)

- `GET /health` → `{ status: "ok" }`
- `POST /objectives` → authenticate principal, evaluate policy, then create a
  draft objective and emit `objective.created`. Returns `401` unauthenticated,
  `400` invalid body, `403` on a policy `deny` (with the reason), `202` when the
  action requires approval, `201` on success.
- `GET /objectives/:id` → fetch or `404`.

## Auth is a temporary dev shim

Identity is read from `x-donna-*` request headers (`devPrincipalFromHeaders`).
**This is not production authentication** — real auth (Supabase Auth + MFA,
server-side session validation) lands in a later phase. The policy engine still
makes every authorization decision; the shim only assembles the trusted
principal a verified session would provide.

## State is in-memory for now

`InMemoryObjectiveService` backs the skeleton and tests. The Drizzle-backed
service — persisting the objective and enqueuing `objective.created` in the
transactional outbox within one transaction — lands with the DB wiring; the
route contract and emitted event are identical.

## Running

```bash
PORT=3000 pnpm --filter @donna/control-plane start
```

Tests drive the app via Fastify `inject` (no open port, no database).
