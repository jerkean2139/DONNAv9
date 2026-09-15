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

## Auth is a temporary dev shim

Identity is read from `x-donna-*` request headers (`devPrincipalFromHeaders`).
**This is not production authentication** — real auth (Supabase Auth + MFA,
server-side session validation) lands in a later phase. The policy engine still
makes every authorization decision; the shim only assembles the trusted
principal a verified session would provide.

## State is in-memory for now

`InMemoryObjectiveService` and `InMemoryTaskService` back the skeleton and
tests. The Drizzle-backed services — persisting the objective/task and enqueuing
its event (and, for a dispatch, the work-order job) in the transactional outbox
within one transaction — land with the DB wiring; the route contracts and
emitted events are identical.

## Running

```bash
PORT=3000 pnpm --filter @donna/control-plane start
```

Tests drive the app via Fastify `inject` (no open port, no database).
