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
- `POST /objectives/:id/tasks` — **the enqueue path** (§4.1/§5). Authenticate,
  confirm the objective exists (`404 objective_not_found`), evaluate policy
  against the objective's own scope/ownership, then create a durable task
  (emitting `task.created`) and hand a **work order** to the durable queue. The
  worker's `execute-work-order` task consumes it and runs it through the
  orchestrator. Returns `401`, `400` (invalid body), `403` on `deny`, `202
approval_required`, or `202 { status: "queued", task, jobId }` on success.

## The enqueue path

`POST /objectives/:id/tasks` is the front door to the execution runtime. It
builds a `WorkOrder` (`@donna/orchestrator`) from the created task plus the
request's routing hints (`requiredCapabilities`, `needsReasoning`,
`reasoningTier`, `modelRequest`, …) and enqueues it through a `WorkQueue`:

- **`GraphileWorkQueue`** (production) enqueues an `execute-work-order` job into
  the same Postgres graphile-worker consumes from — using the task id as the
  job key so a re-dispatch replaces the pending job rather than duplicating it.
  The job name lives in `@donna/orchestrator` (`EXECUTE_WORK_ORDER_TASK`), the
  one contract shared by producer and consumer.
- **`InMemoryWorkQueue`** (skeleton/tests) records enqueued orders instead.

`createGraphileWorkQueue(DATABASE_URL)` is wired in `main.ts`; without a database
the process falls back to the in-memory queue (jobs are not durable) and warns.

## Authentication

Every mutating route (and objective reads) authenticates via an injected
`Authenticator` before the policy gate runs. `main.ts` picks it by environment:

- **Production JWT** (`AUTH_JWKS_URL` set, with a database) — the identity
  provider (**Clerk**) owns signup/login/MFA; the API only **verifies** the
  bearer JWT and derives the principal. `verifyToken` checks signature (via the
  provider's JWKS), issuer/audience and expiry, and **enforces MFA** as a
  server-side claim when `AUTH_REQUIRE_MFA=true`. `DrizzlePrincipalResolver` then
  maps the token subject → a user via `users.external_auth_id`, and reads the
  user's **membership role from our tables** — authority is server-side RBAC,
  never taken from the token (§6). Outcomes: `401` missing/invalid token, `403
mfa_required`, `403 no_account` (valid token, no provisioned user/membership).
  It is provider-agnostic — any OIDC/JWT issuer works by pointing the env config
  at its JWKS.

  | Env                             | Meaning                                                                          |
  | ------------------------------- | -------------------------------------------------------------------------------- |
  | `AUTH_JWKS_URL`                 | Provider JWKS endpoint (enables JWT auth)                                        |
  | `AUTH_ISSUER` / `AUTH_AUDIENCE` | Expected `iss` / `aud` (optional)                                                |
  | `AUTH_REQUIRE_MFA`              | `true` to require the MFA claim                                                  |
  | `AUTH_MFA_CLAIM`                | Claim signalling MFA (default `mfa`; Clerk sets it via a session-token template) |

- **Dev shim** (no `AUTH_JWKS_URL`) — identity from `x-donna-*` headers
  (`devPrincipalFromHeaders`), with a loud warning. **Not production auth**; for
  local runs and tests only. The policy engine still makes every authorization
  decision.

Secrets/URLs come from the environment / Railway, never source (§8).

## State: durable with `DATABASE_URL`, in-memory without

The composition root (`main.ts`) picks the backing by `DATABASE_URL`:

- **Durable** (`DATABASE_URL` set) — `DrizzleObjectiveService` and
  `DrizzleTaskDispatcher` persist to Postgres. Each write is transactional:
  - `create` inserts the objective **and** writes `objective.created` to the
    event outbox (`dispatched_at = null`) in one transaction.
  - `dispatch` inserts the task, writes `task.created`, **and** enqueues the
    `execute-work-order` job — via graphile-worker's `add_job`, which
    participates in the same transaction — so all three commit together or not
    at all. The task id is the job key, so a retried dispatch replaces the
    pending job rather than duplicating it. `runMigrations` runs at startup to
    ensure graphile-worker's schema exists before the first `add_job`.
- **In-memory** (no `DATABASE_URL`) — `InMemoryObjectiveService` /
  `InMemoryTaskDispatcher` back local runs and the test suite. Not durable; the
  route contracts and emitted events are identical.

The event-envelope→row mapping is the one canonical `eventEnvelopeToRow` in
`@donna/db`, shared with the worker's outbox bus.

## Tenant-scoped reads

`objectiveService.get(id, organizationId)` is tenant-isolated: an objective owned
by another organization reads as `null`, never crosses the boundary. `GET
/objectives/:id` requires authentication (401 otherwise) and scopes to the
principal's organization, so a valid principal in the wrong org gets `404`, not
the row. The domain `Objective` carries no org id, so the in-memory store tracks
tenancy alongside it, matching the Drizzle query's `WHERE organization_id = …`.
(Scoping is independent of how the principal is authenticated — see
Authentication above.)

## Running

```bash
# durable (uses the Railway Postgres):
DATABASE_URL=postgres://… PORT=3000 pnpm --filter @donna/control-plane start
# in-memory (no database):
PORT=3000 pnpm --filter @donna/control-plane start
```

## Tests

Unit tests drive the app via Fastify `inject` against the in-memory services (no
open port, no database) and run in normal CI.

The Drizzle services and the transactional `add_job` are covered by
`persistence.integration.test.ts`, which runs the real services against a live
Postgres. It is **skipped unless `TEST_DATABASE_URL` is set**, so unit CI stays
green without a database; point it at a throwaway Postgres to run it (never
production):

```bash
# with a local Postgres (e.g. infra/docker) reachable at $TEST_DATABASE_URL:
TEST_DATABASE_URL=postgres://…/donna pnpm --filter @donna/control-plane test
```

The harness applies the Drizzle migrations and graphile-worker's schema itself,
seeds throwaway tenancy rows per test, and asserts the outbox + transactional
enqueue invariants (including atomic rollback and tenant-scoped reads).
