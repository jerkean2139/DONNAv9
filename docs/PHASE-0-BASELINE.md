# Phase 0 Baseline Report

**Repository:** `jerkean2139/DONNAv9`
**Baseline commit:** `b255262bf51843eab762c257955107232f8e0014`
**Audit date:** 2026-09-23

## Purpose

This report records what is actually present in DONNA v9 before the Agent Factory
work begins. It separates repository-verified facts from production facts that
still require direct Railway/database verification.

## Verified repository baseline

The codebase is no longer a Phase 0 scaffold. The following implementation is
present:

- React/Vite web application.
- Fastify control-plane application.
- graphile-worker worker application.
- Postgres/Drizzle persistence.
- Objective, Task, Event, tenancy, governance, and delegation schema.
- deterministic policy and approval engine.
- Work Router above Model Router.
- Anthropic, OpenAI, local-model, deterministic, HTTP, and GHL adapters.
- orchestrator with capability/model fallback and usage ledger.
- Context Packet builder.
- transactional event/outbox architecture.
- Clerk-oriented auth/provisioning.
- Railway deployment configuration.
- tenant-scoped project/team authorization.
- schema-level cross-tenant foreign-key protection.

## Database migrations

The repository contains six application migrations:

- `0000_typical_luckman.sql`
- `0001_colorful_patch.sql`
- `0002_calm_stranger.sql`
- `0003_green_wild_child.sql`
- `0004_wild_stranger.sql`
- `0005_warm_khan.sql`

Migration `0005` adds composite `(organization_id, id)` targets and
cross-tenant foreign-key protections for core references.

## CI baseline

Normal CI is green on the current architecture branch after Markdown formatting
was normalized. The live-Postgres integration job is also green.

## Multi-tenant baseline

Current schema enforcement includes:

- `organization_id` on business-state rows.
- organization-scoped users, teams, projects, objectives, tasks, and events.
- team and project membership modeling.
- composite tenant-safe foreign keys for cross-record references.
- policy-based scoped reads.
- no role-based bypass of PRIVATE scope.

This is the foundation to preserve for all Agent Factory additions.

## Governance baseline

Current governance includes:

- deterministic policy evaluation.
- authority levels.
- exact-scope approvals.
- material-scope-change invalidation.
- kill switches.
- audit-event schema.
- idempotency records.
- feature flags.

Agent Factory, Skills, Judge, and learning behavior must sit below these
governance boundaries rather than bypassing them.

## Deployment baseline

Production infrastructure was directly verified on Railway on 2026-09-24:

- control plane deployment is healthy.
- worker deployment is healthy.
- authoritative production Postgres is healthy.
- the erroneous standalone `@donna/core-domain` runtime service was removed; the
  package remains a source dependency used by runtime applications.
- Postgres point-in-time recovery (PITR) is enabled.
- the initial PITR full/base backup completed successfully.
- continuous WAL archiving is healthy.
- production remained online during the recovery drill.

### PITR restore drill

A point-in-time restore was requested for **2026-09-23 23:25:36 EDT**. Railway
created a new sibling Postgres service and left the source production database
running.

The restored service `Postgres-restored-20260924-0325` reached SUCCESS.

Read-only verification in the restored database confirmed:

- PostgreSQL responds normally.
- 22 non-system application/worker tables are present.
- expected DONNA tables include organizations, users, teams, memberships,
  projects, project_memberships, objectives, tasks, task_dependencies, events,
  approvals, delegations, audit_events, feature_flags, and idempotency_keys.
- `drizzle.__drizzle_migrations` is present.
- `graphile_worker.migrations` is present.
- the Drizzle migration table contains exactly **6** application migration
  records, matching the repository baseline of migrations `0000` through
  `0005`.

This verifies that PITR can recover the DONNA application schema and migration
state into a separate service without replacing production.

Multiple temporary restored services were created during the mobile restore
test. They are disposable drill artifacts and may be removed after this evidence
is recorded.

No production schema migration was performed as part of the restore drill.

## Documentation drift found

The root README still described the project as "Phase 0 — foundation
scaffolding" with "No product behavior yet." That description is stale.

The repository-structure document is more current and already marks major
packages through the routing/orchestration phases as implemented.

This PR updates the high-level status to match the codebase.

## Phase 0 exit gates

Phase 0 exit gates are now satisfied:

- normal CI is green.
- live-Postgres integration is green.
- README/repository docs reflect the implemented baseline.
- Agent Factory architecture ADRs are accepted.
- baseline/rollback commit is recorded.
- production control plane, worker, and Postgres are healthy.
- PITR is enabled and archiving.
- a separate-service PITR restore completed successfully.
- restored schema and the six-record Drizzle migration baseline were verified.
- no new Phase 1 production migration was run during the safety verification.

**Phase 0 status: COMPLETE.**

Phase 1 schema work may proceed through normal branch/PR/test review. Production
migration remains a separately controlled deployment action and must continue to
follow backup, review, and rollback requirements.

## Rollback point

The pre-Agent-Factory application baseline is:

`b255262bf51843eab762c257955107232f8e0014`

No Agent Factory application code should be merged in a way that prevents
returning to this baseline while Phase 1 is being introduced.
