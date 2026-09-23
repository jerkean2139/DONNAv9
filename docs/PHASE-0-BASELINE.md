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

On the Agent Factory planning branch, the live-Postgres integration job has
successfully completed both the application build and integration tests.

The planning branch initially failed the normal CI job only because the new
Markdown master plan was not formatted to the repository's Prettier rules.
That documentation formatting issue is being corrected in this PR before the
baseline is declared green.

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

Repository configuration verifies that Railway is the selected host for the
long-running control-plane and worker tier and that Railway Postgres is the
intended authoritative production store.

The actual current Railway dashboard state, applied migration level, database
backup policy, restore success, environment variables, and live service health
have **not** been independently verified in this repository audit.

Those checks remain required before any production migration.

## Documentation drift found

The root README still described the project as "Phase 0 — foundation
scaffolding" with "No product behavior yet." That description is stale.

The repository-structure document is more current and already marks major
packages through the routing/orchestration phases as implemented.

This PR updates the high-level status to match the codebase.

## Phase 0 exit gates

Phase 0 is complete only when:

- normal CI is green.
- live-Postgres integration is green.
- README/repository docs reflect the implemented baseline.
- the Agent Factory architecture ADR is accepted.
- the baseline/rollback commit is recorded.
- no production migration has been run.
- production backup/restore status is verified before Phase 1 schema changes.

## Rollback point

The pre-Agent-Factory application baseline is:

`b255262bf51843eab762c257955107232f8e0014`

No Agent Factory application code should be merged in a way that prevents
returning to this baseline while Phase 1 is being introduced.
