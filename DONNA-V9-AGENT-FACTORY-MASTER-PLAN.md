# DONNA V9 — Agent Factory Master Plan

**Repository:** `jerkean2139/DONNAv9`
**Baseline:** `b255262bf51843eab762c257955107232f8e0014`
**Plan branch:** `plan/agent-factory-master-plan`

This document governs the next evolution of DONNA v9. It does not authorize a
production deployment or destructive database migration.

## 1. Executive decision

DONNA v9 remains the foundation. Do not greenfield-rewrite it.

The current codebase already has the correct control-plane spine: TypeScript,
React/Vite, Fastify, Postgres/Drizzle, graphile-worker, durable Objective/Task/Event
concepts, deterministic policy and approvals, Work Router above Model Router,
Context Packets, cost governance, provider adapters, events/outbox, Clerk-oriented
authentication, GoHighLevel integration, Railway configuration, and tenant
protections.

The next evolution adds an Agent Factory and organizational-intelligence layer
without weakening those boundaries.

> **Donna is permanent. Workers are disposable. Skills are reusable. Business state
> is authoritative. Models are replaceable. Humans retain authority over
> consequential decisions.**

## 2. Verified current state

The repository currently contains:

- `apps/control-plane`: Fastify API and control-plane runtime.
- `apps/worker`: graphile-worker runtime and capability/model adapters.
- `apps/web`: React/Vite command-first experience.
- `packages/core-domain`: durable domain types and state machines.
- `packages/db`: Drizzle/Postgres schema, migrations, and persistence helpers.
- `packages/policy`: permissions, approvals, and kill switches.
- `packages/work-router`: execution-class selection before model selection.
- `packages/model-router`: capability/cost/privacy-aware model selection.
- `packages/orchestrator`: policy, routing, execution, events, and cost ledger.
- `packages/context`: token-budgeted Context Packets.
- `packages/events`: typed events, bus, and transactional outbox.
- Anthropic, OpenAI, local-model, HTTP, deterministic, and GHL adapters.
- Organization-scoped access with team/project memberships.
- Composite tenant-safe foreign keys through migration `0005`.
- Railway configuration and production fail-closed authentication.

## 3. Preserve, extend, and add

### Preserve

Keep these unless an ADR documents a measured reason to change them:

- TypeScript and Node 22.
- pnpm workspaces and Turborepo.
- React/Vite/Tailwind.
- Fastify.
- PostgreSQL and Drizzle.
- pgvector strategy.
- graphile-worker initially.
- Objective, Task, and Event.
- Work Router above Model Router.
- provider adapter boundaries.
- deterministic policy and approvals.
- Context Packets and cost governance.
- transactional events/outbox.
- Clerk authentication direction.
- Railway deployment.
- schema-level tenant isolation.

### Extend

Extend existing concepts instead of replacing them:

- Organization becomes Business Graph plus Operating Profile.
- Policy and authority gain a Business Constitution.
- Context Packets retrieve state, knowledge, memory, skills, and recent events.
- Events become safe autonomous triggers.
- Risk gains consequence, reversibility, and evidence-based disposition.
- Approvals become a researched Approval Inbox.
- Integrations gain tenant self-service onboarding.
- Model routing gains measured performance data.

### Add

Add these capabilities:

- Agent Factory.
- immutable/versioned AgentSpec.
- Skills 2.0.
- temporary Worker Runtime.
- independent Judge/Evaluator.
- bounded refinement loop.
- Business Graph.
- Business Constitution.
- semantic, episodic, procedural, and working-memory separation.
- knowledge ingestion and provenance.
- outcome-learning proposals.
- object storage for source files and large artifacts.
- agent/run observability and evaluation datasets.

## 4. Target control flow

```text
Human / Event / Integration
          |
          v
      DONNA CONTROL PLANE
          |
   Objective + Task Graph
          |
      WORK ROUTER
       /       \
deterministic   AI-required
     |              |
 capability       AGENT FACTORY
 adapter             |
                 AgentSpec
                      |
                 MODEL ROUTER
                      |
              TEMPORARY WORKER
                      |
                   OUTPUT
                      |
              INDEPENDENT JUDGE
                /          \
             FAIL          PASS
              |              |
          REFINE         RISK ENGINE
              |              |
              +--------> act / verify / approval
                              |
                           OUTCOME
                              |
                  state + proposed learning
```

The LLM never owns durable state, policy, approval, identity, tenant boundaries,
or authority.

## 5. Agent Factory

Create `packages/agent-factory`.

The Agent Factory compiles a Task into an immutable, versioned `AgentSpec`.
It does not create a permanent persona.

An AgentSpec contains at least:

- organization, objective, and task IDs.
- role, objective, and definition of done.
- exact Skill versions.
- Context Packet reference.
- allowed and denied capabilities.
- authority ceiling and approval-policy reference.
- model requirements without hard-coding one provider.
- token, cost, time, retry, and tool-call budgets.
- output schema and evaluation rubric.
- quality threshold and evidence requirements.
- refinement policy and maximum attempts.
- escalation and retention rules.
- correlation and trace IDs.

A model may propose an AgentSpec. Deterministic code must validate and clamp the
proposal against tenant policy, available capabilities, and authority.

## 6. Skills 2.0

Upgrade the planned `packages/skills` from an SOP registry into reusable execution
recipes.

A SkillVersion contains:

- purpose and applicability.
- required inputs and context.
- allowed tools and required authority.
- ordered workflow or loop.
- output schema and definition of done.
- evidence requirements and evaluation rubric.
- failure modes and escalation rules.
- model/capability hints.
- tests and examples.
- version, provenance, owner, and approval state.

A Skill cannot grant itself authority. The Agent Factory takes the intersection
of Skill requests, user authority, organization policy, and platform policy.

Promoting a learned workflow into an approved Skill requires explicit approval.

## 7. Organizational intelligence

### Business Graph

Use Postgres first. Do not add a graph database without measured query needs.

Model organizations, people, users, teams, companies, clients, projects,
integrations, objectives, tasks, meetings, decisions, sources, knowledge items,
and Skills plus typed relationships.

Every relationship carries organization identity, provenance, confidence,
validity dates, and audit metadata.

### Business Constitution

Represent organizational operating rules separately from platform security
policy.

Include:

- mission, goals, and priorities.
- roles and authority.
- definitions of done.
- decision rules.
- customer promises.
- communication and brand rules.
- financial and operational authority.
- AI boundaries.
- escalation rules.
- risk tolerance.
- never-autonomous actions.

Normalize rules that must be enforced. Constitution changes are versioned,
audited, and approval-gated.

## 8. Memory and knowledge

Keep these layers separate:

- **Authoritative state:** current relational truth.
- **Knowledge:** sourced information with provenance and confidence.
- **Semantic memory:** stable facts/preferences useful for retrieval.
- **Episodic memory:** what happened, when, and with what outcome.
- **Procedural memory:** approved ways of working linked to Skills.
- **Working memory:** the disposable task Context Packet.

Memory writes are policy-gated proposals. Secrets never enter semantic memory.
pgvector is an index, not the only copy of information.

## 9. Worker, Judge, and refinement

The Worker executes the immutable AgentSpec.

The Judge receives the task, definition of done, output, evidence, and rubric.
Prefer a different model/provider or deterministic verifier when practical.

Judge output is structured and includes:

- pass/fail.
- threshold result.
- failed criteria.
- unsupported claims.
- missing evidence.
- requested corrections.
- risk flags.

Refinement is bounded by attempts, budget, and deadline.

## 10. Risk and authority

Action disposition considers:

- consequence and reversibility.
- financial, customer, security, and data scope.
- actor authority.
- evidence quality.
- deterministic verification.
- Judge result.
- historical reliability for the Skill/model/tool combination.

Allowed dispositions are:

- `auto_execute`.
- `execute_and_log`.
- `verify_then_execute`.
- `request_approval`.
- `block_and_escalate`.

High-consequence actions require approval regardless of model confidence.

## 11. Approval Inbox

Each approval packet contains:

- the exact requested decision.
- business, objective, and task.
- what happened.
- checks and evidence.
- actions already completed safely.
- available options.
- Donna's proposed action and rationale.
- consequence, risk, and reversibility.
- cost/customer impact where relevant.
- exact scope being approved.
- expiration and material-change behavior.

Reuse the existing exact-scope approval invalidation behavior.

## 12. Event-driven Donna

Adapters and webhooks may ingest events from email, GHL, Fathom, GitHub,
calendar, Slack, forms, deadlines, billing, and support systems.

All external content is untrusted.

The flow is:

```text
ingest
  -> normalize
  -> deduplicate/idempotency
  -> resolve tenant
  -> policy
  -> objective/task proposal
  -> Work Router
```

External events can never grant authority or modify policy.

## 13. Tenant onboarding

The onboarding flow is:

1. Create organization and owner.
2. Connect systems through OAuth, APIs, or MCP where appropriate.
3. Inventory available sources and capabilities.
4. Run read-only discovery.
5. Propose the Business Graph.
6. Propose the Operating Profile and Constitution.
7. Have the owner review/correct them.
8. Define approval and authority thresholds.
9. Validate tenant isolation and connector scopes.
10. Explicitly activate event triggers.

A connector's technical permissions do not automatically become Donna's
operational authority.

## 14. Model Router evolution

Preserve the current Model Router.

Add measured metadata for task/Skill category, pass rate, Judge score, latency,
effective cost per accepted result, tool success, context limits, privacy, and
availability.

Optimize for the lowest expected cost of an accepted result, not merely the
cheapest token price.

Provider and model IDs remain configuration data.

## 15. Storage and deployment

The target remains:

- Railway for web/control-plane/worker services as appropriate.
- managed Postgres initially.
- pgvector in Postgres.
- S3-compatible object storage for source files and large artifacts.
- volumes only when mounted persistent storage is actually required.
- tested database backups and restore procedure.

Do not migrate production data merely to match older planning language that
mentioned Supabase.

## 16. Security invariants

Keep the existing fail-closed posture and add tests for:

- cross-tenant AgentSpec, context, and tool access.
- malicious Skills requesting excess authority.
- prompt injection in email, web pages, and files.
- model attempts to modify policy.
- forged tenant IDs in events.
- approval replay after material change.
- malicious instructions returned by tools.
- secret leakage into prompts, memory, or traces.
- runaway refinement loops.
- replayed webhooks.
- connector blast radius.

Every material tool call must be auditable. Never log secrets.

## 17. Observability and evaluation

Implement OpenTelemetry plus an Agent Run ledger.

Trace:

```text
trigger -> objective -> task -> context -> AgentSpec -> model route
        -> tool calls -> worker -> judge -> refinement -> approval
        -> action -> outcome
```

Track cost, latency, retries, acceptance rate, human overrides, failures, and
Skill/model performance.

Maintain regression evaluation datasets for important Skills.

## 18. Implementation phases

### Phase 0 — Baseline and protection

- Pin the baseline.
- Run format, lint, typecheck, tests, build, and live-Postgres integration.
- Inventory database migrations and deployment configuration.
- Reconcile stale documentation.
- Record the Agent Factory architecture in an ADR.
- Make no destructive production changes.

**Done when:** a known-good baseline and rollback point are documented.

### Phase 1 — Organizational intelligence

Build Business Graph, Business Constitution/Operating Profile, provenance, and
tenant-isolation tests.

**Done when:** business structure and approved rules are authoritative outside
model prompts.

### Phase 2 — Knowledge and memory

Build source ingestion, semantic/episodic/procedural memory, pgvector indexing,
and Context Packet retrieval.

**Done when:** relevant, provenanced context can be retrieved under budget while
authoritative state remains separate.

### Phase 3 — Skills 2.0

Build versioned Skill contracts, approval lifecycle, rubrics, schemas, and tests.

**Done when:** at least three real Skills execute through versioned contracts.

### Phase 4 — Agent Factory

Build AgentSpec domain/schema/compiler/validator, capability-authority
intersection, and budgets.

**Done when:** a Task produces an auditable executable AgentSpec without excess
authority.

### Phase 5 — Temporary Agent Runtime

Execute AgentSpecs with checkpoints, artifacts, traces, ceilings, and cleanup.

**Done when:** disposable workers leave durable outcomes without becoming
permanent business memory.

### Phase 6 — Judge and refinement

Build evaluator contracts, independent/deterministic checks, bounded refinement,
and regression fixtures.

**Done when:** failed work is corrected or escalated and loops terminate
predictably.

### Phase 7 — Risk and authority

Build consequence, reversibility, evidence, and disposition rules.

**Done when:** low-risk work can auto-execute and consequential work cannot
bypass approval.

### Phase 8 — Approval Inbox

Build projection, API, UI, and evidence packets.

**Done when:** a human receives a decision rather than a pile of homework.

### Phase 9 — Event-driven operation

Build webhook/event adapters, normalization, deduplication, and event-to-task
flow.

**Done when:** approved event types can safely initiate work without chat.

### Phase 10 — Tenant onboarding

Build connector catalog, discovery, graph/constitution proposal, and authority
setup.

**Done when:** a new business can onboard without source-code edits.

### Phase 11 — Learning loop

Capture outcomes and overrides as proposed memory, rule, or Skill changes.

**Done when:** Donna improves from outcomes without silently rewriting authority.

### Phase 12 — Production hardening

Run adversarial security suites, load/failure tests, backup/restore drills,
cost/rate controls, and observability checks.

**Done when:** staging acceptance gates pass.

### Phase 13 — Production rollout

Use staged Railway rollout, reviewed migrations, backup proof, canary features,
and documented rollback.

**Done when:** production is observable and reversible.

## 19. Build rules

1. Read this plan, the existing Greenfield plan, ADRs, and relevant code first.
2. Existing working architecture wins unless an ADR documents a change.
3. Never rewrite working packages wholesale.
4. Keep PRs small and phase-scoped.
5. Branch from a known-good commit.
6. Review every schema migration and document recovery.
7. Enforce organization identity on tenant-scoped data.
8. Keep provider SDKs inside adapters.
9. Models propose; deterministic code authorizes.
10. Never place secrets in code, prompts, memory, logs, or fixtures.
11. Add tests before declaring a phase complete.
12. Require human approval for production deployment or destructive migration.
13. Update ADRs when reality changes the design.
14. Preserve compatibility where practical.
15. Never silently enable a new autonomous action.

## 20. Immediate next work

Before Phase 1 application coding:

- finish the Phase 0 baseline report.
- reconcile README and repository-status documentation.
- adopt the Agent Factory architecture ADR.
- verify all CI jobs are green.
- inventory production backup/restore status before any schema migration.
- create Phase 1 implementation issues with acceptance criteria.

## 21. Non-goals

Not required now:

- a graph database.
- Kubernetes.
- replacing Postgres.
- a permanent agent mob.
- unrestricted self-modifying agents.
- model-controlled policy.
- vectorizing every company document.
- replacing graphile-worker because another queue is fashionable.
- rebuilding the UI/framework without a measured product reason.

## 22. Product definition

DONNA is a persistent, multi-tenant business intelligence and control plane.
It understands an organization's authoritative state, knowledge, relationships,
rules, and goals; routes work to deterministic systems, humans, or AI; compiles
temporary AI workers with the minimum context, Skills, tools, and authority
required; independently evaluates their work; executes inside explicit policy;
and escalates consequential decisions to humans with the homework already done.
