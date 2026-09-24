# DONNA V9 — Agent Factory Master Plan

**Repository:** `jerkean2139/DONNAv9` **Baseline:** `b255262bf51843eab762c257955107232f8e0014`
**Architecture update branch:** `plan/v9-persistent-learning-integrations`

This document governs the next evolution of DONNA v9. It does not authorize a production deployment
or destructive database migration.

## 1. Executive decision

DONNA v9 remains the foundation. Do not greenfield-rewrite it.

The current codebase already has the correct control-plane spine: TypeScript, React/Vite, Fastify,
Postgres/Drizzle, graphile-worker, durable Objective/Task/Event concepts, deterministic policy and
approvals, Work Router above Model Router, Context Packets, cost governance, provider adapters,
events/outbox, Clerk-oriented authentication, GoHighLevel integration, Railway configuration, and
tenant protections.

The next evolution adds an Agent Factory and organizational-intelligence layer without weakening
those boundaries.

> **Donna is permanent. Workers are disposable. Skills are reusable. Memory is persistent. Business state is authoritative. Models are replaceable. Systems enforce guardrails. Humans retain authority over consequential decisions.**

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
- persistent layered memory with lifecycle management.
- Learning Engine and policy-gated learning proposals.
- Integration Intelligence: API/connector/MCP/tool registry and OpenAPI discovery.
- KOB Marketplace skill import/audit path.
- client onboarding, offboarding, archival, revalidation, and reactivation.
- Human Authority Doctrine and destructive-action gates.
- unified voice/chat/desktop/PWA/API interaction contract.
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

The LLM never owns durable state, policy, approval, identity, tenant boundaries, or authority.

## 5. Agent Factory

Create `packages/agent-factory`.

The Agent Factory compiles a Task into an immutable, versioned `AgentSpec`. It does not create a
permanent persona.

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

A model may propose an AgentSpec. Deterministic code must validate and clamp the proposal against
tenant policy, available capabilities, and authority.

## 6. Skills 2.0

Upgrade the planned `packages/skills` from an SOP registry into reusable execution recipes.

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

A Skill cannot grant itself authority. The Agent Factory takes the intersection of Skill requests,
user authority, organization policy, and platform policy.

Promoting a learned workflow into an approved Skill requires explicit approval.

## 7. Organizational intelligence

### Business Graph

Use Postgres first. Do not add a graph database without measured query needs.

Model organizations, people, users, teams, companies, clients, projects, integrations, objectives,
tasks, meetings, decisions, sources, knowledge items, and Skills plus typed relationships.

Every relationship carries organization identity, provenance, confidence, validity dates, and audit
metadata.

### Business Constitution

Represent organizational operating rules separately from platform security policy.

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

Normalize rules that must be enforced. Constitution changes are versioned, audited, and
approval-gated.

## 8. Memory and knowledge

Keep these layers separate:

- **Authoritative state:** current relational truth.
- **Knowledge:** sourced information with provenance and confidence.
- **Semantic memory:** stable facts/preferences useful for retrieval.
- **Episodic memory:** what happened, when, and with what outcome.
- **Procedural memory:** approved ways of working linked to Skills.
- **Working memory:** the disposable task Context Packet.

Memory writes are policy-gated proposals. Secrets never enter semantic memory. pgvector is an index,
not the only copy of information.

### Memory lifecycle

Memory is persistent, but persistent does not mean permanently active.

Every memory or knowledge item must carry enough metadata to determine tenant, subject, type,
source/provenance, confidence, sensitivity, lifecycle, validation, last use, and supersession.

Supported lifecycle states include:

- `candidate`: proposed learning that is not yet trusted as business truth.
- `active`: eligible for normal retrieval within its authorized scope.
- `dormant`: retained and searchable but normally excluded from working context.
- `archived`: historical intelligence retained for deliberate retrieval/reactivation.
- `superseded`: retained for history but replaced by newer validated information.

Deletion is separate from archival and is always governed as a destructive action.

Client offboarding archives client-specific operational intelligence rather than erasing
institutional history. Reactivation requires revalidation before stale facts, relationships,
procedures, or permissions become active again.

## 9. Learning Engine

Create a policy-gated Learning Engine that closes the loop between work and persistent memory.

The flow is:

```text
conversation / event / work / correction / outcome
  -> extract candidate learning
  -> attach evidence, subject, scope, confidence, and sensitivity
  -> compare existing state/knowledge/memory
  -> reject / propose new / propose update / propose supersession
  -> deterministic policy
  -> store when permitted OR request human approval
  -> future Context Packets may retrieve the validated result
```

Models may propose learning but may not silently rewrite authoritative state, Business Constitution
rules, permissions, tenant boundaries, or delegated authority.

Repeated human approvals are evidence of a pattern, not an automatic delegation of authority. Donna
may propose a policy or procedural change; an authorized human must approve it.

Corrections and overrides are first-class learning signals. Donna should distinguish one-time
exceptions from proposed durable rules.

## 10. Integration Intelligence

Create an Integration Intelligence layer and registry for internal and external systems.

It must support, where appropriate:

- REST/HTTP APIs and OpenAPI/Swagger.
- OAuth/API-key/service connections through the secrets layer.
- MCP servers and approved plugin/connector capability definitions.
- webhooks and event contracts.
- internal Zenoflo/KOB applications.
- browser/computer interaction only when a safer structured interface is unavailable.

The registry records system identity, tenant ownership, authentication reference, objects/resources,
readable and writable capabilities, event types, risk class, required authority,
documentation/provenance, version, health, and approval state.

Donna may ingest an OpenAPI specification or approved API documentation and generate a proposed Tool
Manifest plus human-readable internal API documentation. Generated capabilities are not active until
validated against platform and tenant policy.

Internal systems such as project management, task management, client portals, partner portals, and
future Zenoflo applications communicate with Donna through governed APIs/events rather than creating
separate business brains.

Credentials and secrets never enter memory, prompts, Skills, or documentation.

## 11. KOB Marketplace and Skills

The KOB Marketplace GitHub repository is treated as a capability library, not a trusted authority
source.

Before finalizing Skills 2.0, audit the existing Marketplace structure and map reusable skills,
prompts/loops, evaluators, MCP definitions, connector/API definitions, and documentation into
Donna's provider-neutral Skill contract.

Skill lifecycle:

`draft -> testing -> approved -> active -> deprecated -> archived`

Repository presence alone does not activate a Skill. Skills are versioned, provenanced, tested,
permission-scoped, risk-classified, and approval-gated.

The Agent Factory may select approved Skills for a Task, but deterministic policy computes the
actual capability and authority intersection.

## 12. Worker, Judge, and refinement

The Worker executes the immutable AgentSpec.

The Judge receives the task, definition of done, output, evidence, and rubric. Prefer a different
model/provider or deterministic verifier when practical.

Judge output is structured and includes:

- pass/fail.
- threshold result.
- failed criteria.
- unsupported claims.
- missing evidence.
- requested corrections.
- risk flags.

Refinement is bounded by attempts, budget, and deadline.

## 13. Human Authority Doctrine, risk, and destructive actions

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

The operating objective is not complete autonomy. Donna should perform the 80–90% heavy lifting:
read, research, organize, analyze, draft, prepare, recommend, and complete approved low-risk work.
Humans retain consequential judgment and authorization.

Use least privilege by default. Technical connector permission never equals operational authority.

For consequential work use:

`propose -> preview exact change -> verify scope -> risk check -> human approval -> execute exact
approved scope -> verify result -> audit -> learn`

A prior approval cannot be stretched to materially different scope.

Destructive actions receive an additional gate. Prefer reversible operations in this order where
supported:

`disable -> archive -> trash/soft-delete -> permanent delete`

Permanent deletion, bulk destructive operations, permission/security changes, financial actions, and
material customer-facing changes require explicit authority and normally human approval.
Paying-customer systems and GHL sub-accounts receive strict tenant/resource scoping.

Workers, Skills, connectors, external events, and the Learning Engine can request authority but
cannot grant it.

## 14. Approval Inbox

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

## 15. Event-driven Donna

Adapters and webhooks may ingest events from email, GHL, Fathom, GitHub, calendar, Slack, forms,
deadlines, billing, and support systems.

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

## 16. Client and tenant lifecycle

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

A connector's technical permissions do not automatically become Donna's operational authority.

Client lifecycle is explicit:

`prospect -> onboarding -> active -> paused/dormant -> offboarding -> archived -> reactivation`

Onboarding begins read-only. Donna discovers what it can from approved sources, proposes the graph,
memory, rules, systems, projects, and unknowns, then asks humans to resolve material gaps.

Offboarding creates an auditable Client Archive Package, removes/revokes active access according to
policy, archives client-specific operational intelligence, and preserves historical provenance.

Reactivation never blindly restores archived state. Donna revalidates stale facts, people, systems,
rules, permissions, and procedures before returning them to active use.

## 17. Model Router evolution

Preserve the current Model Router.

Add measured metadata for task/Skill category, pass rate, Judge score, latency, effective cost per
accepted result, tool success, context limits, privacy, and availability.

Optimize for the lowest expected cost of an accepted result, not merely the cheapest token price.

Provider and model IDs remain configuration data.

## 18. Storage and deployment

The target remains:

- Railway for web/control-plane/worker services as appropriate.
- managed Postgres initially.
- pgvector in Postgres.
- S3-compatible object storage for source files and large artifacts.
- volumes only when mounted persistent storage is actually required.
- tested database backups and restore procedure.

Do not migrate production data merely to match older planning language that mentioned Supabase.

## 19. Security invariants

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
- destructive-action bypass.
- bulk-operation scope expansion.
- archived-client data leaking into active retrieval.
- stale archived permissions reactivating automatically.
- unapproved Marketplace Skill activation.
- API/tool manifest requesting capabilities beyond policy.

Every material tool call must be auditable. Never log secrets.

## 20. Observability and evaluation

Implement OpenTelemetry plus an Agent Run ledger.

Trace:

```text
trigger -> objective -> task -> context -> AgentSpec -> model route
        -> tool calls -> worker -> judge -> refinement -> approval
        -> action -> outcome
```

Track cost, latency, retries, acceptance rate, human overrides, failures, and Skill/model
performance.

Maintain regression evaluation datasets for important Skills.

## 21. Implementation phases

### Phase 0 — Production safety baseline

Pin the baseline; verify CI; reconcile deployment documentation; verify Railway service health;
prove database backup and restore; preserve a known-good rollback point. No destructive production
changes.

**Done when:** the control plane/worker baseline is observable and a tested recovery path exists
before new production schema work.

### Phase 1 — Business Graph and Constitution

Build organizational relationships, provenance, lifecycle-aware client entities, Operating
Profile/Business Constitution, and adversarial tenant-isolation tests.

**Done when:** business structure and approved rules are authoritative outside model prompts.

### Phase 2 — Persistent layered memory

Build knowledge ingestion, semantic/episodic/procedural/preference memory, working-memory
boundaries, lifecycle states, archive/supersession semantics, pgvector indexing, and Context Packet
retrieval.

**Done when:** Donna retrieves relevant active memory while dormant/archived data is excluded by
default and authoritative state remains separate.

### Phase 3 — Learning Engine

Build candidate-learning extraction, evidence/confidence, conflict detection, policy gates, human
review, correction/override learning, and safe memory update.

**Done when:** Donna can improve from outcomes without silently rewriting truth, policy, or
authority.

### Phase 4 — Skills 2.0 and KOB Marketplace

Audit KOB Marketplace, define provider-neutral Skill contracts, lifecycle, versioning, tests,
rubrics, provenance, and approved import/promotion paths.

**Done when:** at least three real approved Skills execute through versioned contracts and
repository presence alone cannot activate them.

### Phase 5 — Integration Intelligence

Build Tool/Integration Registry, API discovery, OpenAPI ingestion/generation, MCP/connector
manifests, webhook contracts, internal-app API contracts, health, and permission mapping.

**Done when:** an internal app can be connected, documented, capability-mapped, and safely exposed
to Donna without giving it uncontrolled authority.

### Phase 6 — Agent Factory

Build AgentSpec domain/schema/compiler/validator, capability-authority intersection, budgets, Skill
selection, and exact Context Packet references.

**Done when:** a Task produces an auditable executable AgentSpec without excess authority.

### Phase 7 — Worker, Judge, and refinement

Execute AgentSpecs with checkpoints/artifacts/traces; independently evaluate outputs; bound
refinement by attempts, cost, time, and policy.

**Done when:** failed work is corrected or escalated and temporary workers leave durable outcomes
without becoming permanent business memory.

### Phase 8 — Human authority and risk

Implement least privilege, consequence/reversibility/evidence dispositions, destructive-action
gates, bulk-operation protection, exact-scope approvals, and customer-account safeguards.

**Done when:** low-risk work can proceed and consequential/destructive work cannot bypass
deterministic policy and required human approval.

### Phase 9 — Approval Inbox

Build researched decision packets, API, projection, and UI.

**Done when:** humans receive a clear decision with evidence, preview, scope, risk, reversibility,
and recommendation instead of a pile of homework.

### Phase 10 — Event-driven operation

Build webhook/event adapters, normalization, tenant resolution, deduplication, and event-to-task
flow.

**Done when:** approved event types can initiate work without chat but cannot grant themselves
authority.

### Phase 11 — Client onboarding, offboarding, and reactivation

Build read-only discovery, client activation, archive packages, connector/access offboarding, memory
lifecycle transitions, and revalidation/reactivation.

**Done when:** a client can enter and leave active operations without data leakage, memory
pollution, or loss of useful history.

### Phase 12 — Voice, chat, desktop/PWA, and API experience

Make all interaction surfaces use the same Donna identity, state, memory, permissions, tasks, and
approvals. UI should appear when useful rather than forcing users through application menus.

**Done when:** the same request can continue across supported surfaces without creating separate
Donna memories or authority models.

### Phase 13 — Security and production hardening

Run adversarial tenant, connector, Marketplace, prompt-injection, destructive action, load/failure,
cost/rate, observability, and backup/restore suites.

**Done when:** staging acceptance gates and recovery drills pass.

### Phase 14 — Controlled production rollout

Use reviewed migrations, backup proof, staged Railway rollout, canary features, kill switches, and
documented rollback.

**Done when:** production is observable, reversible, and governed.

### Next version — Donna Blueprint / client deployment template

Do not allow this to expand the v9 finish line.

After v9 is proven, extract the safe minimum foundation into a reusable client deployment template:
tenant isolation, security, approvals, graph, Constitution, persistent memory, learning, Skills,
Integration Intelligence, Agent Factory, events, audit, and model routing. Add each client's people,
rules, systems, projects, brand, workflows, knowledge, and industry requirements as an isolated
client layer.

**Goal:** prove our Donna first; productize the proven foundation second.

## 22. Build rules

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

## 23. Immediate next work

Before Phase 1 application coding:

- finish the Phase 0 baseline report.
- reconcile README and repository-status documentation.
- adopt the Agent Factory architecture ADR.
- verify all CI jobs are green.
- inventory production backup/restore status before any schema migration.
- create/update implementation issues for the revised phases with acceptance criteria.
- audit the KOB Marketplace before finalizing Skills 2.0.
- do not apply new production schema migrations until backup/restore proof exists.

## 24. Non-goals

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

## 25. Product definition

DONNA is a persistent, multi-tenant business intelligence and control plane that learns how the
business works, maintains layered memory over time, connects safely to internal and external
systems, routes work to deterministic systems, humans, or AI, and compiles temporary AI workers with
the minimum context, Skills, tools, and authority required. It independently evaluates AI work,
performs the 80–90% heavy lifting, executes only inside explicit policy, and escalates consequential
decisions to humans with the homework already done.

Donna is the interface. The governed Business Operating System lives underneath her. Voice, chat,
desktop/PWA, and API are surfaces into the same business brain.
