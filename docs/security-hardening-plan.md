# DONNA V2 — Trust-Boundary Hardening Plan (Group 1)

Status: **DRAFT for review** — no code written yet. This plan responds to the
external (Codex) audit of `cdca8c2` and my own verification of each claim against
the tree. It covers the first group only: the security + execution-integrity
boundary. Group 2 (dependencies, durable cost controls, web UI, deployment,
acceptance testing) is deliberately out of scope here.

## How to read this

Each item below is **one PR**, landed and merged **serially** — they touch the
same core files (`main.ts`, `server.ts`, `worker.ts`, `orchestrator.ts`, the
schema) and would conflict badly in parallel. I renamed them **SEC-1..SEC-6** so
they don't collide with the already-merged GitHub PRs #20 (auto-migration) and
#21 (Railway config) — the audit's "PR #20–#24" numbering predates those.
Governance wiring is split into its own **SEC-7** (approved) so idempotency
(SEC-6) lands clean.

---

## My assessment of the audit

**Verified and agreed (all confirmed in code at `caf0eae`):**

1. **Auth fails open.** `main.ts` falls back to the dev header shim when
   `AUTH_JWKS_URL` or the DB is absent, and to in-memory storage when
   `DATABASE_URL` is absent — with only a `console.warn`. MFA defaults off;
   issuer/audience optional. **This is the one finding that alone justifies
   "BLOCKED for production."** Agreed, top priority.
2. **Scoped objective reads aren't policy-checked.** `GET /objectives/:id` is
   org-scoped (good) but never calls `evaluate()`, so PRIVATE/TEAM/PROJECT scope
   isn't enforced on read. Confirmed.
3. **The enqueued work order drops the safety contract.** `buildWorkOrder`
   carries only routing hints. `capabilityInput`, `policy`, `budget`,
   `idempotencyKey`, and any per-capability authority are **not** enqueued.
   Confirmed.
4. **Idempotency is not enforced.** `tasks.idempotency_key` has a **non-unique**
   index; the dedicated `idempotency_keys` table (which _does_ have a unique
   constraint) is referenced only by a schema test; and the orchestrator's
   execution context sets `correlationId` only — **never `idempotencyKey`**.
   Confirmed.
5. **The worker never updates the authoritative task row.** It emits events and
   logs, but `tasks.status` stays `pending` forever. Confirmed.

**Where I'd correct or add nuance (flagging before planning, as asked):**

- **The API _does_ gate dispatch.** `POST /objectives/:id/tasks` runs
  `evaluate()` with a full `ResourceDescriptor` (scope, owner, projectId) against
  a **server-defined** action constant, and returns 403/202. So it's not true
  that policy runs "only when JSON happens to include it" — that's true of the
  **worker**, not the API. This matters: the fix is _defense-in-depth at
  execution_ (reconstruct policy in the worker from durable data), not "add the
  missing gate." I agree with reconstructing server-side; I'm just naming the
  starting point accurately.
- **"Every task defaults to PREPARE" is the safe direction, not the risk.**
  PREPARE is the _lowest_ authority level, and the dispatch action's authority is
  a server constant, not client-supplied — so JSON can't _elevate_ authority
  today. The real gap is that per-capability authority for the _actual
  side-effecting work_ isn't modeled or re-checked at execution. Same fix, more
  precise framing.
- **The idempotency adapter wiring is already ~half done.** The HTTP adapter
  already reads `ctx.idempotencyKey` and emits an `Idempotency-Key` header, and
  GHL composes it. So once the orchestrator puts the key in `ctx`, outbound
  provider idempotency comes "for free" — the real work is the transactional
  reservation table + unique constraint + result reuse, not adapter plumbing.
- **RLS: deferred (agreed with you).** Composite org FKs + mandatory
  repository-layer org scoping + adversarial cross-tenant tests cover the
  realistic threat now. Postgres RLS with `postgres.js`/graphile pooling needs
  per-transaction tenant claims on every path — valuable defense-in-depth, but a
  separate later PR, not a blocker.
- **Ordering dependency the first brief missed:** enforcing **PROJECT** scope on
  reads (SEC-2) needs project membership, which does **not** exist yet — the
  resolver hardcodes `projectIds: []` and there's a `projects` table but no
  membership table. TEAM scope _is_ enforceable today (`teamIds` is populated).
  So tenant work (SEC-3) must land **before or with** full scoped-read
  enforcement. The revised ordering already reflects this; SEC-2 ships TEAM +
  PRIVATE + org enforcement now and PROJECT enforcement is completed by SEC-3.

**Bottom line:** the architecture is sound (Work Router above Model Router,
clean provider boundaries, transactional outbox, green tests incl. live-PG). The
gaps are integrity _wiring_, not redesigns — exactly what to fix pre-production.
"BLOCKED" is fair, driven mostly by SEC-1. Grade quibbling aside, the technical
findings hold up.

---

## Sequenced plan (Group 1)

### SEC-1 — Fail-closed production authentication

**Problem:** dev-header auth + in-memory fallback can serve production.

**Design:**

- Add an explicit `APP_ENV` (`production` | `development` | `test`), read once at
  boot.
- `development`/`test`: dev header shim permitted (as today), loud warning.
- `production`: require `DATABASE_URL`, `AUTH_JWKS_URL`, `AUTH_ISSUER`,
  `AUTH_AUDIENCE`, `AUTH_REQUIRE_MFA=true`, `CLERK_WEBHOOK_SECRET`. Any missing →
  log which vars are absent (names only, never values) and `process.exit(1)`
  **before** `app.listen`.
- Never fall back to in-memory storage or dev auth in production.
- Audit logging: never log tokens, credentials, or full `authorization` headers.

**Acceptance:** production start fails when each required var is individually
absent; production cannot use caller-supplied identity headers; dev auth requires
`APP_ENV≠production`; unit tests cover production/test/development; lint +
typecheck + test + build green.

**Deps:** none. **Migration:** none.

---

### SEC-2 — Enforce authorization on scoped objective reads

**Problem:** `GET /objectives/:id` skips policy.

**Design:** load within org, build the full `ResourceDescriptor` (owner + scope +
projectId when present), run the **same** `evaluate()` mutations use, and return
`404 not_found` for both missing and unauthorized (never reveal existence of an
inaccessible cross-scope resource). Enforce ORG + PRIVATE + TEAM now; PROJECT
enforcement is completed once SEC-3 populates project membership.

**Acceptance:** tests for owner / authorized team member / unauthorized
same-org user / private objective / cross-org / admin elevation; no bypass via
headers or ids; existing API tests stay green.

**Deps:** none to start; PROJECT case finished by SEC-3. **Migration:** none.

---

### SEC-3 — Tenant integrity (composite FKs + project membership + adversarial tests)

**Problem:** no project-membership model; FKs are single-column (org not part of
the child→parent key), so a mismatched-org reference isn't structurally
prevented; `projectIds` is always empty.

Split for reviewability into **SEC-3a** (additive: membership + team binding,
low migration risk) and **SEC-3b** (composite FKs, which reshape the reference
graph). Both merged.

**SEC-3a — done (PR #26):**

- `project_memberships` table (org + project + user, unique per project+user).
- `Objective.teamId` persisted to the generic `scope_ref` column and surfaced
  only for TEAM scope, so a TEAM-scoped read can reconstruct team membership.
- Principal resolver populates `projectIds` from `project_memberships`, scoped
  to the user's organization.
- Completes SEC-2's TEAM/PROJECT read enforcement (member-allowed /
  non-member-hidden unit tests; live-DB test proving membership → `projectIds`).

**SEC-3b — done:**

- Composite `UNIQUE (organization_id, id)` targets on `users`, `teams`,
  `projects`, `objectives`, `tasks`.
- Composite `(organization_id, <ref>)` FKs on child rows (tasks→objectives,
  tasks→tasks parent, task_dependencies→tasks ×2, events→objectives/tasks,
  objectives→users/projects, memberships→users/teams,
  project_memberships→projects/users) so a row cannot reference a parent in
  another org.
- **Additive, low-risk shape:** existing single-column FKs are kept (they own
  the `ON DELETE` cascade / set-null behavior); the composite FKs are added
  with `ON DELETE NO ACTION` and only enforce tenant co-location at
  insert/update. This sidesteps the composite-`SET NULL` trap (which would try
  to null the `NOT NULL` `organization_id`); nullable refs are skipped via
  MATCH SIMPLE. No constraints dropped.
- Adversarial cross-tenant insert tests (task→foreign objective,
  task_dependency edge, event→foreign objective, membership→foreign user) all
  rejected at the DB; in-tenant sanity insert accepted. Migration `0005`
  validated against throwaway PG (all 12 integration tests green).

**Acceptance:** cross-tenant reference insert fails at the DB ✅; `projectIds`
populated ✅; SEC-2's PROJECT case now enforced ✅; adversarial tests pass against
live PG ✅.

**Deps:** SEC-2 merged. **Migration:** new table (0004) + composite
constraints (0005); migrator already runs on boot (PR #20).

---

### SEC-4 — Persist authoritative task transitions — done

**Problem:** the worker ran orders and the orchestrator emitted the execution
trace, but nothing ever updated `tasks.status` — the durable row stayed
`pending` forever, so recovery, reclamation and UI could not tell what happened.

**Design (as built):** a `TaskStateStore` the worker owns. The worker hands the
orchestrator a per-job `BufferingEventBus` (the trace is collected in memory,
not written mid-run), then `commitOutcome` does everything in ONE transaction:
lock the task row, write the buffered trace events, walk the domain state
machine to the outcome status, and update the row — so the row and its events
can never disagree once committed. Redelivery-safe: a task already terminal is
skipped (no illegal transition, no duplicate events); a row that is not
`pending` is skipped rather than risking a poison job. A retryable failure with
budget left increments `retryCount`, emits `task.retried`, and re-enqueues the
same order (keyed by task id, so it replaces rather than duplicates). A thrown
error in `commitOutcome` is transient — the worker rethrows so graphile-worker
retries the whole job; a business outcome never rethrows.

Outcome → task status: completed→completed; approval_required→awaiting_approval;
denied/blocked/budget_exceeded/awaiting_human→blocked; failed→failed (or
→pending + retryCount++ when retries remain).

**Acceptance:** success→completed ✅; policy denial→blocked ✅;
approval→awaiting_approval ✅; retryable→retry incremented + still retryable ✅;
terminal→failed ✅; row and events committed together (never disagree) ✅;
integration tests on live PG ✅ (7 cases: each mapping, retry re-enqueue,
exhausted-retry terminal, redelivery no-op, not_found).

**No migration:** the `tasks` table already carries status, retry_count,
checkpoint, lease/heartbeat columns. The failure `reason` lives on the emitted
event (the audit trail), not a new column.

**Deferred (by design):** side-effect idempotency on redelivery (a completed
task that is redelivered re-runs `executeWorkOrder` before `commitOutcome` skips
the row) is SEC-6's idempotency-key work, not SEC-4. SEC-4 guarantees row/status
idempotency only. The `running` window is not separately persisted (buffering
commits `pending`→terminal atomically); live lease/heartbeat reclamation is a
later concern.

**Deps:** SEC-3 merged.

---

### SEC-5 — Preserve the full execution & safety contract API→queue→worker

**Problem:** capabilityInput/policy/authority/approval/budget/idempotency/actor
are dropped between API and adapter; worker policy gate is a no-op.

**Design:** define a server-owned execution contract persisted on the task
(capability input, server-derived required authority, authenticated actor,
resource scope, approval requirement + state, budget ref, idempotency key,
correlation). The worker **reconstructs** policy input from durable task +
principal data — never trusts JSON for authority/decisions. Reject executable
work orders missing required policy info. Ensure `capabilityInput` reaches the
adapter. Runtime-validate the queued payload (zod).

**Acceptance:** no executable work reaches an adapter without policy evaluation;
approval-required work can't execute before durable approval; JSON can't lower
required authority; capabilityInput survives create→serialize→parse→execute;
full-path integration tests.

**Deps:** SEC-4 merged (needs durable task state to reconstruct from).
**Migration:** task columns for the persisted contract; document.

---

### SEC-6 — Transactional idempotency

**Problem:** non-unique key index; unused idempotency table; key never reaches
adapters.

**Design:**

- Unique partial `(organization_id, idempotency_key)` (partial: null keys stay
  valid). Reserve the key transactionally before execution; persist
  pending/completed/failed; reuse the prior result on a completed retry; handle
  concurrent duplicates via the unique constraint.
- Thread the key through `WorkOrder` → `ExecutionContext` (the HTTP/GHL adapters
  already emit `Idempotency-Key` once ctx carries it).

**Acceptance:** concurrent duplicates → one side effect; crash-after-provider-
call doesn't repeat it; Graphile retry keeps the key; GHL/side-effect adapter
tests; migration + rollback documented.

**Deps:** SEC-5 merged.

---

### SEC-7 — Governance wiring

**Problem:** kill switches, approval lifecycle, approver eligibility, exact
approval scope, and policy audit records are not connected to execution.

**Design:** connect kill switches (deny at the gate), approval
creation/consumption + approver eligibility + exact approval scope, and policy
audit records, to the execution path.

**Acceptance:** kill switch blocks execution; approval consumed exactly once;
approver eligibility enforced; audit row written per decision; migration +
rollback documented.

**Deps:** SEC-6 merged. Split out from SEC-6 (approved) so idempotency lands
clean and governance gets its own focused PR.

---

## What I recommend

- Do SEC-1 through SEC-6 serially, each merged before the next (they share core
  files). Review after SEC-1..SEC-5 at the latest, per your note — that's the
  security boundary; mistakes there propagate.
- Keep each PR surgical and tied to its acceptance criteria; no scope creep.
- I'll report per PR: merge SHA, tests added, commands run + results, deviations,
  anything not safely fixable.
- Group 2 stays parked until you sign off on Group 1 results.
