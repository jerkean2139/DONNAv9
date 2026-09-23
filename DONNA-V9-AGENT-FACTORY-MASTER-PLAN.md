# DONNA V9 — AGENT FACTORY MASTER PLAN

**Repository:** `jerkean2139/DONNAv9`
**Baseline audited:** `b255262bf51843eab762c257955107232f8e0014`
**Plan branch:** `plan/agent-factory-master-plan`
**Status:** Governing implementation plan. No production deployment or destructive migration is authorized by this document.

## 1. Executive decision

DONNA v9 remains the foundation. Do **not** greenfield-rewrite it.

The existing architecture already implements or scaffolds the correct control-plane spine: TypeScript/Node, React/Vite, Fastify, Postgres/Drizzle, pgvector-ready storage, graphile-worker, durable Objective/Task/Event concepts, deterministic policy/approvals, Work Router above Model Router, cost governance, Context Packets, provider adapters, transactional events/outbox, Clerk-oriented auth, GoHighLevel capability integration, Railway deployment, and schema-level multi-tenant protections.

The next evolution is to add an **Agent Factory** and organizational-intelligence layer without weakening those boundaries.

> **Donna is permanent. Workers are disposable. Skills are reusable. Business state is authoritative. Models are replaceable. Humans retain authority over consequential decisions.**

## 2. Current-state audit

Verified in the repository:

- `apps/control-plane`: Fastify control plane with durable-store/auth wiring.
- `apps/worker`: graphile-worker runtime with OpenAI, Anthropic, local-model and GHL adapter wiring.
- `apps/web`: React/Vite command-first experience.
- `packages/core-domain`: Objective, Task, Event, scope, role, authority and compute-node domain types/state machines.
- `packages/db`: Drizzle/Postgres authoritative store and migrations.
- `packages/policy`: deterministic permissions, approvals and kill switches.
- `packages/work-router`: selects deterministic/API/automation/human/AI execution before model selection.
- `packages/model-router`: selects the lowest-cost eligible model by reasoning tier, tools, vision, privacy, context and availability.
- `packages/orchestrator`: policy → work routing → model/capability execution → cost ledger → events.
- `packages/context`: token-budgeted Context Packets with cache-aware ordering.
- `packages/events`: typed events, bus and transactional outbox.
- Provider isolation through adapters, including Anthropic and OpenAI.
- Multi-tenant design using `organization_id`, scoped access, project/team memberships and composite tenant-safe foreign keys.
- Railway deployment configuration and production fail-closed authentication hardening.

## 3. Preserve / extend / add

**Preserve:** TypeScript/Node 22; pnpm/Turborepo; React/Vite/Tailwind; Fastify; PostgreSQL/Drizzle; pgvector strategy; graphile-worker initially; Objective/Task/Event; Work Router; Model Router; adapters; deterministic policy; approvals/kill switches; Context Packets; cost governor; event/outbox; Clerk direction; Railway; tenant isolation.

**Extend:** Organization model into Business Graph/Operating Profile; policy into Business Constitution; Context Packets into state+knowledge+memory+skills+events; events into autonomous triggers; risk into confidence/consequence/reversibility; approvals into researched Approval Inbox; integrations into tenant onboarding; Model Router into measured performance-aware routing.

**Add:** Agent Factory; AgentSpec; Skills 2.0; temporary Worker Runtime; independent Judge; bounded refinement; Business Graph; Business Constitution; memory/knowledge pipeline; outcome-learning proposals; object storage; agent/run observability and evaluation datasets.

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
          context + skills + tools
          authority + rubric + budget
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
                 authoritative state
                 + proposed learning
```

The LLM never owns durable state, policy, approval, identity, tenant boundaries or authority.

## 5. Agent Factory

Create `packages/agent-factory`. It compiles a Task into an immutable/versioned `AgentSpec`, not a permanent persona.

Minimum AgentSpec: id/version; organizationId; objectiveId/taskId; role; objective; definitionOfDone; required Skill versions; contextPacketId; allowed/denied capabilities; authority ceiling; approval policy; model requirements (not hard-coded provider); token/cost/time/tool-call budgets; output schema; evaluation rubric; quality threshold; evidence requirements; refinement/max attempts; escalation conditions; retention policy; correlation/trace IDs.

A model may propose an AgentSpec, but deterministic code validates/clamps it against tenant policy, capabilities and authority.

## 6. Skills 2.0

Upgrade `packages/skills` from SOP registry into reusable execution recipes. A SkillVersion contains purpose/applicability, required inputs/context, allowed tools, required authority, workflow/loop, output schema, definition of done, evidence requirements, evaluation rubric, failure modes, escalation rules, model hints, tests/examples, version/provenance/owner/approval state.

Skills cannot grant authority. Agent Factory takes the intersection of skill requests, user authority, organization policy and platform policy. Promotion into an approved Skill requires explicit approval.

## 7. Organizational intelligence

### Business Graph
Use Postgres first. Model Organization, Person, User, Team, Company, Client, Project, Integration/System, Objective, Task, Meeting, Decision, Source, KnowledgeItem and Skill plus typed relationships. Relationships carry organization_id, provenance, confidence, validity and audit metadata. Do not add a graph DB without measured need.

### Business Constitution
Version organizational operating rules separately from platform security policy: mission/goals/priorities; roles/authority; definitions of done; decision rules; customer promises; brand/communication rules; financial/operational authority; AI boundaries; escalation; risk tolerance; never-autonomous actions. Normalize enforceable rules. Constitution changes are audited and approval-gated.

## 8. Memory and knowledge

Keep separate: authoritative state (current relational truth); knowledge (sourced/provenanced information); semantic memory (stable retrievable facts/preferences); episodic memory (events/outcomes); procedural memory (approved methods linked to Skills); working memory (disposable task Context Packet).

Memory writes are policy-gated proposals. Secrets never enter semantic memory. pgvector is an index, never the only copy.

## 9. Worker / Judge / refinement

Worker executes immutable AgentSpec. Judge receives task, definition of done, output, evidence and rubric. Prefer independent provider/model or deterministic verifier when practical.

Judge returns structured pass/fail, threshold result, failed criteria, unsupported claims, missing evidence, corrections and risk flags. Refinement is bounded by attempts, budget and deadline.

## 10. Risk and authority

Disposition uses consequence, reversibility, financial/customer/security scope, authority, evidence quality, deterministic checks, judge result and historical reliability. Outcomes: auto_execute; execute_and_log; verify_then_execute; request_approval; block_and_escalate. High-consequence actions require approval regardless of model confidence.

## 11. Approval Inbox

Approval packet: exact decision; business/objective/task; what happened; checks/evidence; safely completed actions; options; proposed action/rationale; consequence/risk/reversibility; cost/customer impact; exact approved scope; expiration/material-change behavior. Reuse exact-scope invalidation.

## 12. Event-driven Donna

Adapters/webhooks may ingest email/message, GHL, Fathom, GitHub, calendar, Slack, forms, deadlines, billing/support events. All external content is untrusted. Flow: ingest → normalize → dedupe/idempotency → tenant resolve → policy → objective/task proposal → Work Router.

## 13. Tenant onboarding

Create organization/owner → connect systems via OAuth/API/MCP → inventory sources/capabilities → read-only discovery → propose Business Graph → propose Constitution/Operating Profile → owner correction/approval → authority thresholds → tenant/connector validation → explicitly activate triggers. OAuth capability never implies autonomous authority.

## 14. Model Router evolution

Preserve current router. Add measured task/skill performance, judge score/pass rate, latency, effective cost per accepted result, tool success, context/privacy/availability. Optimize for lowest expected cost of an accepted result, not cheapest token price. Provider/model IDs remain configuration.

## 15. Storage/deployment target

Railway web/control-plane/worker; managed Postgres initially; pgvector in Postgres; S3-compatible object storage for documents/source files/artifacts; volumes only when mounted persistence is actually required; tested DB backups/restores. Do not migrate production merely to match an older plan's Supabase wording.

## 16. Security invariants

Add tests for cross-tenant AgentSpec/context/tool access; malicious Skills requesting authority; prompt injection in email/web/files; model policy-modification attempts; forged event tenant IDs; approval replay; malicious tool output; secret leakage; runaway refinement; webhook replay; connector blast radius. Every material tool call is auditable. Never log secrets.

## 17. Observability/evaluation

OpenTelemetry + Agent Run ledger. Trace trigger → objective → task → context → AgentSpec → model route → tool calls → worker → judge → refinements → approval → action → outcome. Track cost, latency, retries, acceptance, overrides, failures and skill/model performance. Maintain regression evaluation datasets for important Skills.

## 18. Implementation phases and gates

**Phase 0 — Baseline/protection:** pin baseline; run lint/typecheck/tests/build; inventory Railway/database/migrations; reconcile stale docs; establish rollback. **Done:** known-good baseline.

**Phase 1 — Organizational intelligence:** Business Graph + Constitution/Operating Profile + provenance + tenant tests. **Done:** tenant business structure/rules are authoritative outside prompts.

**Phase 2 — Knowledge/memory:** source ingestion; semantic/episodic/procedural memory; pgvector; Context Packet retrieval. **Done:** relevant, provenanced context under budget with state separation.

**Phase 3 — Skills 2.0:** versioned contracts, approval lifecycle, rubrics/schemas/tests. **Done:** three real Skills execute through versioned contracts.

**Phase 4 — Agent Factory:** AgentSpec domain/schema/compiler/validator/tool-authority intersection/budgets. **Done:** Task yields auditable executable AgentSpec without excess authority.

**Phase 5 — Temporary runtime:** execute specs, checkpoints/artifacts/traces, ceilings, cleanup. **Done:** disposable workers leave durable outcomes but no accidental permanent persona.

**Phase 6 — Judge/refinement:** evaluator contract, independent/deterministic checks, bounded refinement, fixtures. **Done:** failures correct or escalate; loops terminate predictably.

**Phase 7 — Risk/authority:** consequence/reversibility/evidence disposition. **Done:** low-risk work can auto-execute; consequential work cannot bypass approval.

**Phase 8 — Approval Inbox:** projection/API/UI/evidence packet. **Done:** human gets a decision, not homework.

**Phase 9 — Event-driven operation:** webhook/event adapters, normalization, dedupe, event-to-task. **Done:** approved events safely initiate work without chat.

**Phase 10 — Tenant onboarding:** connector catalog/discovery/graph/constitution/authority setup. **Done:** new business can onboard without source-code edits.

**Phase 11 — Learning loop:** outcomes/overrides → proposed memory/rule/skill changes → approval. **Done:** Donna improves without silently rewriting authority.

**Phase 12 — Hardening:** adversarial suites, load/failure tests, backup/restore, cost/rate controls, observability. **Done:** staging gates pass.

**Phase 13 — Production rollout:** staged Railway rollout, migration backup proof, canary features/tenants, rollback. **Done:** production is observable and reversible.

## 19. Build rules

1. Read this plan, existing GREENFIELD plan, ADRs and relevant code before editing.
2. Existing working architecture wins over invented abstractions unless an ADR documents change.
3. Never rewrite working packages wholesale.
4. One phase/small PR at a time.
5. Branch from known-good commit.
6. Schema changes require reviewed migrations and recovery notes.
7. Tenant-scoped data enforces organization identity.
8. Provider SDKs stay in adapters.
9. Models propose; deterministic code authorizes.
10. No secrets in code/prompts/memory/logs/fixtures.
11. Tests are required before phase completion.
12. No production deployment/destructive migration without explicit human approval.
13. Update plan/ADR when reality changes design.
14. Preserve compatibility where practical.
15. Never silently enable a new autonomous action.

## 20. Immediate next work

Before Phase 1 application coding: run full baseline suite; inspect complete Drizzle schema/migrations and current Railway topology; reconcile README/plan status; write ADR for Agent Factory + Skills 2.0 + Worker/Judge; create Phase 1 issues with acceptance criteria; verify production backup/restore before schema migration.

## 21. Non-goals

No graph database, Kubernetes, Postgres replacement, permanent agent mob, unrestricted self-modifying agents, model-controlled policy, vectorizing everything, queue replacement for fashion, or UI/framework rewrite without measured need.

## 22. Product definition

DONNA is a persistent, multi-tenant business intelligence and control plane that understands an organization's authoritative state, knowledge, relationships, rules and goals; routes work to deterministic systems, humans or AI; dynamically compiles temporary AI workers with the minimum context, skills, tools and authority necessary; independently evaluates their work; executes within explicit policy; and escalates consequential decisions to humans with the homework already completed.
