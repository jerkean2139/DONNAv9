# GREENFIELD V2 TECHNICAL PLAN

**Project:** DONNA v9 (greenfield implementation of DONNA Build Bible V2)
**Repository:** `jerkean2139/DONNAv9`
**Status:** PROPOSAL — awaiting Jeremy's explicit approval before any application coding
**Source of truth:** DONNA — Codex Build Bible V2, documents `00-V2-START-HERE` … `18-V2-GREENFIELD-BUILD-RULES`
**Author:** Claude Code (planning phase)
**Date:** 2026-09-15

---

## 0. How to read this plan

This document is the **Phase-0 design deliverable** required by Build Bible docs 15 and 18. It proposes the greenfield technical architecture for DONNA V2 in the DONNA v9 repository. It contains **no application code** and authorizes none. Per docs 15, 16 and 18, implementation stops here until Jeremy approves.

Every section maps to a V2 invariant or Decisions-Log entry. Where I make a technology choice the Bible left open, it is flagged as a **[DECISION]** and repeated in §22 Open Questions so it can be accepted, changed, or deferred without re-reading the whole document.

**Guiding constraints carried from the Bible (non-negotiable invariants):**

1. Donna is the **operating interface**, not a chatbot panel. (V2-001)
2. Donna is **not an LLM**; the LLM is one replaceable capability behind the control plane.
3. **Relational company/product state is authoritative; semantic memory is contextual, never the system of record.** (V2-005)
4. **Work Router sits above Model Router.** AI is invoked only after work routing decides AI is the right execution class. (V2-006)
5. **Deterministic, server-enforced policy** owns permissions and approvals; prompts never do. (V2-009)
6. **Durable Objective / Task / Event** model survives browser closes, worker crashes and node outages. (V2-008, V2-021)
7. **Providers sit behind replaceable adapters**; no single model/memory/browser vendor is irreplaceable. (V2-007, V2-026)
8. **Cloud control plane stays available with every local node offline.** (V2-016)
9. **Multi-tenant isolation designed from the schema up**, server-enforced and tested. (V2-025)
10. **External content is untrusted data**; it cannot change policy, authority, or reveal secrets. (V2-023)
11. **Secrets never enter semantic memory, logs, prompts, artifacts or source control.**
12. **No destructive migration/deployment or authorization change without explicit approval.** (STOP conditions, doc 16/18)

---

## 1. Architecture

### 1.1 The five layers (from doc 02, made concrete)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. EXPERIENCE      Web app (command-first shell), voice, screen context,   │
│                    Tauri desktop (later). Consumes the event/task model.   │
├──────────────────────────────────────────────────────────────────────────┤
│ 2. CONTROL PLANE   Identity/context · Intent · Objective/Plan · WORK       │
│    (cloud, always  ROUTER · Task graph · Orchestrator (durable) · Policy & │
│     available)     Approvals · Event bus · MODEL ROUTER · Cost Governor    │
├──────────────────────────────────────────────────────────────────────────┤
│ 3. COMPANY         Authoritative relational state (Postgres) · Knowledge   │
│    INTELLIGENCE    base (provenance) · Semantic memory (pgvector index) ·  │
│                    Working context (Context Packets)                       │
├──────────────────────────────────────────────────────────────────────────┤
│ 4. CAPABILITIES    Humans · deterministic services · APIs · automations ·  │
│    (adapters)      browser/computer agents · coding agents · research ·    │
│                    lead builder · MODELS (Anthropic/OpenAI/local) · MCP    │
├──────────────────────────────────────────────────────────────────────────┤
│ 5. INFRASTRUCTURE  Postgres/Supabase · object storage · durable queue ·    │
│                    secrets manager · auth · logs/telemetry · GitHub ·      │
│                    cloud host/VPS · private local compute nodes (mesh)     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Control flow (the spine of the whole system)

```
Human input
  → identify user/org (authn + tenant)
  → determine intent (LLM proposes; deterministic classifier assists)
  → assemble minimal Context Packet (budgeted, ranked)
  → create/update OBJECTIVE (durable, relational)
  → PLAN (LLM proposes a task graph; orchestrator owns it)
  → WORK ROUTER selects execution class per task
       (deterministic code/API → automation → human → local AI → cloud AI → frontier)
  → TASK(s) created with idempotency keys, budgets, approval policy
  → capability ADAPTER executes (if AI: MODEL ROUTER picks model/node first)
  → EVENTS stream every material transition (append-only)
  → CHECKER verifies when required (doer/checker)
  → APPROVAL GATE evaluated deterministically (cannot be bypassed by model reasoning)
  → COMPLETION → authoritative STATE update → policy-gated MEMORY/KNOWLEDGE write
  → REPORT to the human (what matters, not raw logs)
```

### 1.3 Key architectural properties

- **Orchestrator owns durable state; LLMs are advisory.** The LLM produces *proposals* (intent classification, plans, action drafts, memory-write suggestions). The orchestrator, policy engine, and Postgres own the authoritative transitions, retries, budgets and safety. This is the concrete meaning of "Donna is not an LLM."
- **Event-driven UI.** The web experience never polls arbitrary state; it subscribes to the shared event/task model. Every panel (Rail, Workspace, approvals) is a projection of events.
- **Provider independence by construction.** No feature module imports a provider SDK directly. All provider access flows through adapter packages that satisfy a stable contract (§7).
- **Degrade, don't fail.** Every external dependency has a defined timeout → bounded retry → alternate adapter/model/node → degraded state → alert path (doc 14). Losing a model, a memory engine, or all local nodes degrades scope, never core availability.

### 1.4 Recommended technology stack **[DECISION]**

| Concern | Recommendation | Rationale / alternatives |
|---|---|---|
| Language | **TypeScript** end-to-end | One language across control plane, adapters, workers, web; matches legacy `.ts/.tsx` reuse candidates; strong typing for domain state machines. |
| Repo layout | **pnpm workspaces + Turborepo monorepo** | Clean package boundaries enforce the layer separation; shared domain types; fast incremental builds. |
| API/control-plane runtime | **Node + Fastify** (long-running service) | Lightweight, first-class TypeScript, good for a service that also hosts SSE/WS. Alt: NestJS if we want batteries-included DI. |
| Durable state / DB | **Postgres (Supabase)** with **Drizzle ORM** | Postgres is the mandated authoritative store; Drizzle gives typed SQL + reversible SQL migrations. Alt: Prisma. |
| Durable jobs/queue | **graphile-worker** (Postgres-native) as default; **Temporal** flagged as the upgrade path | Postgres-native queue means *transactional enqueue* (job + state change commit together = no lost work), minimal infra. Temporal is the gold standard for long checkpointed workflows if/when scale demands it. See §5. |
| Real-time to UI | **Server-Sent Events / WebSocket gateway** fed by the event bus (Postgres `LISTEN/NOTIFY` or Supabase Realtime) | Matches event-driven UI; avoids polling. |
| Vector/semantic memory | **pgvector in the same Postgres** behind a Memory adapter | Keeps memory as an *index* over authoritative state, not a separate source of truth. Adapter allows swapping to a dedicated vector DB later. |
| Auth | **Supabase Auth** (or Auth.js) with **MFA** + server-side session/policy validation | MFA is mandatory (doc 06/10). Individual accounts, no shared logins. |
| Web app | **React + Vite + TypeScript + Tailwind + shadcn/ui** | Command-first SPA shell, independent of the backend (desktop-shell-ready). Alt: Next.js if SSR wanted. |
| Local node agent | **Small Node/TS service** exposing OpenAI-compatible inference (Ollama/vLLM behind it) + heartbeat | Node contract in doc 09/11. |
| Private networking | **Tailscale-style mesh** (WireGuard) | No public inference/RDP ports (V2-020). |
| Secrets | **Dedicated secrets manager** (Supabase Vault / Doppler / cloud KMS) | Never in memory/logs/source (doc 10). |
| Observability | **OpenTelemetry** traces/metrics/logs + Donna Health dashboard | Doc 14. |
| Hosting | Control plane + workers on a **container host that supports long-running processes** (Fly.io / Railway / VPS); DB on Supabase; web on Vercel/Netlify or same host | Durable workers are **not** serverless-friendly. Flagged in §22. |

> **Why not serverless-first:** durable workers hold leases and heartbeats and run long jobs; they need persistent processes. The web app and stateless read APIs *can* be serverless, but the orchestrator/worker tier must run on always-on containers.

---

## 2. Repository structure

Greenfield monorepo. Directory structure is **derived from V2 boundaries**, not inherited from any legacy repo (doc 18).

```
DONNAv9/
├─ GREENFIELD-V2-TECHNICAL-PLAN.md      # this document
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├─ .env.example                          # names only — never real secrets
│
├─ apps/
│  ├─ web/                # React command experience (Experience layer)
│  ├─ control-plane/      # Fastify API + orchestrator host (Control Plane)
│  ├─ worker/             # durable job worker runtime (own process/deployable)
│  └─ node-agent/         # runs on Dell/Omen: heartbeat + local inference proxy
│
├─ packages/
│  ├─ core-domain/        # Objective, Task, Event, Delegation, Approval types
│  │                      #   + state machines (framework-free, pure logic)
│  ├─ db/                 # Drizzle schema, migrations, typed repositories, RLS
│  ├─ policy/             # deterministic permission + approval engine
│  ├─ work-router/        # execution-class selection (above model routing)
│  ├─ model-router/       # model/node selection + fallback + cost governor hooks
│  ├─ cost-governor/      # budgets, usage ledger, model evaluation
│  ├─ context/            # Context Packet builder + budgeting + cache tiers
│  ├─ memory/             # semantic memory adapter (pgvector) + write policy
│  ├─ knowledge/          # source ingestion + provenance + confidence
│  ├─ events/             # typed event definitions + bus + projections
│  ├─ skills/             # Skill Registry + SOP promotion lifecycle
│  ├─ telemetry/          # OpenTelemetry setup + Donna Health metrics
│  ├─ config/             # model registry, pricing, feature flags, env config
│  ├─ security/           # untrusted-data tagging, injection guards, secret refs
│  └─ adapters/
│     ├─ base/            # BaseCapabilityAdapter + ModelAdapter contracts
│     ├─ model-anthropic/
│     ├─ model-openai/
│     ├─ model-local/     # OpenAI-compatible local (Ollama/vLLM)
│     ├─ github/  browser/  research/  fathom/  slack/
│     ├─ gmail/   drive/    ghl-zenoflo/  lead-builder/
│     ├─ coding-agent/     automation-mcp/
│     └─ … (one package per capability family, doc 09)
│
├─ infra/
│  ├─ docker/             # dev compose (postgres+pgvector, mailhog, etc.)
│  ├─ migrations/         # generated SQL migrations (reviewed, reversible)
│  └─ deploy/             # Fly/Railway/Terraform config per environment
│
├─ docs/
│  ├─ build-bible-v2/     # local mirror of the 00–18 spec (read-only reference)
│  ├─ adr/                # Architecture Decision Records (mirror Decisions Log)
│  └─ runbooks/           # DR restore, kill-switch, incident, node-onboarding
│
└─ tests/
   ├─ acceptance/         # doc 16 acceptance suites
   ├─ tenant-isolation/   provider-independence/  injection/  durability/
```

**Boundary rules enforced in CI:**
- Feature packages may **not** import provider SDKs; only `packages/adapters/*` may.
- `apps/web` may **not** import `db` or `policy` directly; it talks to the control-plane API.
- `core-domain` has **zero** runtime dependencies (pure domain logic, unit-testable).

---

## 3. Database model (authoritative relational state)

Postgres is the source of truth (doc 03, V2-005). Semantic/vector data are indexes, never sole storage.

### 3.1 Multi-tenancy & scope (baked in from row zero)

- **`organization` is the primary isolation boundary.** Every business-state row carries `organization_id`.
- **Scope enum** on scoped rows: `PRIVATE | PROJECT | TEAM | ORGANIZATION`, plus the owning `scope_ref` (e.g. `project_id`, `team_id`, `user_id`).
- Enforcement is **server-side in the policy engine** (§6). **Postgres Row-Level Security is added as defense-in-depth**, not the sole gate (UI hiding is never authorization — doc 06). **[DECISION: enable RLS as belt-and-suspenders — recommended]**

### 3.2 Core entities (doc 03)

Organization, User, Team, Membership, Role, Permission, Person, Company, Client, Project, **Objective, Task, TaskDependency, Event**, Delegation, Approval, Policy, **Skill, SkillVersion**, Artifact, Source, KnowledgeItem, MemoryItem, ContextPacket, Conversation, Meeting, Decision, Lead, Relationship, Integration, Adapter, **ComputeNode, Model, ModelEvaluation, UsageLedger, Budget**, FeatureFlag, AuditEvent, Notification.

### 3.3 Selected table shapes (the load-bearing ones)

**objective**
```
id, organization_id, scope, scope_ref, requester_id, owner_id,
requested_outcome, definition_of_done, priority, risk_level,
budget_ref, status(enum), project_id, due_at, completion_summary,
created_at, updated_at
```

**task** (the durable unit of execution)
```
id, organization_id, objective_id, parent_task_id,
goal, definition_of_done, status(enum: pending|planned|assigned|
   running|blocked|awaiting_approval|checking|completed|failed|cancelled),
execution_class(enum: deterministic|automation|human|browser|coding_agent|
   local_ai|cloud_ai),   -- set by Work Router
required_capabilities[], context_packet_id, assignee_id/worker_id,
risk_level, approval_policy_ref, budget_ref, retry_count, max_retries,
idempotency_key,                    -- protects side effects
lease_owner, lease_expires_at, heartbeat_at,   -- durable job control
checkpoint jsonb,                   -- resumable long jobs
artifacts[], created_at, updated_at
```

**event** (append-only execution history — the audit + recovery + UI feed)
```
id, organization_id, objective_id, task_id, type(enum),
actor(type: human|orchestrator|adapter|checker + id),
adapter/tool, payload_ref (large/sensitive payloads referenced, not inlined),
correlation_id, causation_id, created_at
```

**delegation** — objective/task, delegator, owner, priority, DoD, due, dependencies, provided_resources, **authority_boundary**, escalation_rules, status.

**approval** — requester, proposed_action, target_resources, **exact_scope**, risk, reason, preview_diff_ref, expires_at, approver_id, decision, decided_at, audit refs. *Material scope change invalidates the approval.*

**artifact / source** — provenance: creator, requester, objective/task, models/tools used, source_refs, timestamps, version, checker, approval, destination; **source_confidence: `AUTHORITATIVE | PRIMARY | DERIVED | INFERRED | UNVERIFIED`**.

**usage_ledger** — provider/model/node, input/cached/output/reasoning tokens, tool/compute cost, latency, total_cost, objective/task refs.

**model_evaluation** — task_class, model, reasoning_level, quality/checker score, accepted/corrected, latency, reliability, cost.

**compute_node** — name, kind(dell|omen|future), mode(`AUTO|OFF|LOCAL_ONLY`), status(healthy|degraded|offline), models/capabilities, cpu/ram/gpu/free_vram/temp/power/battery, current_jobs, last_heartbeat_at.

**memory_item / knowledge_item** — content_ref, embedding (pgvector), **source, timestamp, confidence, scope/permissions, version/history**, retention_state, deletion_state.

### 3.4 Retention & deletion (doc 03/05/10)

- Every record supports retention policy, legal/business hold, and a `deletion_state`.
- **Deleting a source triggers cascade invalidation** of derived embeddings/indexes/memory. Soft delete is not a substitute for policy-compliant removal.
- Secrets are **never** columns in these tables; only secret *references* to the secrets manager.

### 3.5 Greenfield note

There is no existing schema to migrate *into* — this is a fresh schema designed from V2 boundaries (doc 18). Legacy schemas (e.g. `011_donna_evaluation_scores.sql`) are **reference only** for the later legacy-audit phase (§21), never the base shape.

---

## 4. Service boundaries & event model

### 4.1 Services / deployables

| Deployable | Responsibility | Scaling |
|---|---|---|
| **control-plane API** (`apps/control-plane`) | Authn/authz, intent, objective/plan CRUD, Work Router entry, approvals, event stream (SSE/WS), read projections | horizontal, stateless |
| **worker runtime** (`apps/worker`) | Claims tasks (lease+heartbeat), runs adapters, checkpoints, emits events, runs checker, respects budgets | horizontal, stateful leases |
| **node-agent** (`apps/node-agent`) | Runs on Dell/Omen; heartbeat + resource telemetry; local OpenAI-compatible inference proxy over mesh | one per machine |
| **web** (`apps/web`) | Command experience; pure client of the API + event stream | CDN/edge |

The orchestrator logic lives in `packages/` and is *hosted* by the API (for synchronous planning/routing) and the worker (for execution). This keeps domain logic transport-independent.

### 4.2 Event types (doc 02) + envelope

Canonical events: `objective.created`, `task.created`, `task.planned`, `task.assigned`, `worker.started`, `tool.called`, `artifact.created`, `approval.requested`, `approval.decided`, `task.blocked`, `task.retried`, `task.completed`, `task.failed`, `memory.updated`, `node.health_changed`, `system.alert`.

Envelope (every event): `id, type, organization_id, objective_id?, task_id?, actor, correlation_id, causation_id, payload_ref, created_at`.

- Events are **append-only** and are the substrate for: UI projections, audit trail, recovery/replay, and observability metrics.
- **Sensitive payloads are referenced, not copied** into the event body (doc 03/10).
- The **transactional outbox**: a state change and its event are written in the **same DB transaction**; the event bus then fans out. This guarantees no state change happens without a recorded event, and no phantom events.

---

## 5. Queue / durable job model

Directly satisfies V2-021 and doc 04/14/16 ("Objectives survive browser closure; worker failure recovers without losing the objective; retries don't duplicate protected side effects").

### 5.1 Mechanism (default: Postgres-native)

- **Durable state = the `task` table itself.** Tasks are not ephemeral queue messages; they are rows with a full lifecycle state machine (§3.3).
- **Dispatch = graphile-worker** (Postgres-backed). Because enqueue happens in the *same transaction* as the state write, work is never lost on crash.
- **Leases + heartbeats:** a worker claims a task by setting `lease_owner` + `lease_expires_at` and periodically bumps `heartbeat_at`. If the lease expires (worker died), the task is **safely reclaimable** by another worker.
- **Checkpoints:** long jobs persist progress into `task.checkpoint` (jsonb) so a resumed task continues rather than restarts.
- **Idempotency:** every side-effecting task carries an `idempotency_key`. Adapters that touch the outside world (email, CRM, posts, deploys, charges) **must** honor it, so retries never duplicate (doc 04).
- **Retry policy** distinguishes **transient** (timeout, 5xx, node offline → bounded retry / alternate route) from **deterministic** (bad input, permission denied → fail fast, no blind retry). Never loop indefinitely (doc 04 failure flow).

### 5.2 Upgrade path **[DECISION]**

If workflow complexity or scale outgrows the Postgres queue, migrate the *dispatch/checkpoint* layer to **Temporal** without changing the domain model — the Objective/Task/Event tables remain the record; Temporal would own the execution timeline. Recommend **starting with graphile-worker** (minimal infra, one dependency) and keeping Temporal as a documented, non-blocking option.

---

## 6. Permission & approval model (deterministic, server-enforced)

Doc 06, V2-009. **Prompts never grant authority.**

### 6.1 Evaluation

Every request is evaluated against: **authenticated identity → organization → role → resource scope → action → current policy.** UI hiding is not authorization; enforcement is server-side in `packages/policy`, additionally backstopped by Postgres RLS.

### 6.2 Authority levels

| Level | Name | Meaning |
|---|---|---|
| 0 | **Observe** | read-only |
| 1 | **Prepare** | research / draft / analyze / propose changes |
| 2 | **Routine Action** | explicitly approved repeatable actions within bounded policy |
| 3 | **Approval Required** | money, contracts, pricing, production deploys, client-facing outbound comms, destructive data changes, security/permission changes |
| 4 | **Never Autonomous** | org-defined actions that always require direct human execution |

Execution authority = **intersection** of user role ∩ resource permissions ∩ skill policy ∩ current approval state. A skill can never grant itself authority (doc 13).

### 6.3 Approval object & gates

- Orchestration **pauses at deterministic approval gates**; model reasoning cannot bypass them (doc 04).
- Approval stores exact scope + preview/diff where possible; **material scope change invalidates prior approval** and forces re-approval.
- **Roles (initial):** Organization Owner/Admin, Executive, Team Lead, Team Member, Contractor/Restricted — refined by resource- and action-level permissions.

### 6.4 Kill controls (doc 06/14)

Authorized admin can independently pause: **all autonomous action**, **outbound communication**, **browser/computer actions**, **deployments**, **API spend**, and **local-node routing** — while preserving read/research where safe. These are enforced as global + per-capability feature flags checked by the orchestrator before any side effect.

### 6.5 Private context

Private memory/context is inaccessible to other members unless **explicitly** shared under policy. Executive/admin status does **not** silently expose private context (doc 06).

---

## 7. Adapter contracts (provider independence)

Doc 09, V2-007. Business logic talks to stable Donna interfaces; only adapter packages know a vendor exists.

### 7.1 Base capability adapter (conceptual signature)

```
interface CapabilityAdapter {
  id; name; version;
  capabilities(): CapabilitySpec;
  health(): { status: 'healthy'|'degraded'|'offline'; detail };
  estimate(task, context): { cost; latency; confidence };
  execute(task, context): Result;          // honors idempotency key
  streamEvents(): AsyncIterable<Event>;     // or status()
  cancel(taskId): void;
  reportUsage(): UsageRecord;               // feeds UsageLedger
  classifyError(err): 'transient'|'deterministic'|'auth'|'rate_limit'|…;
}
```

### 7.2 Model adapter (extends the base)

Normalizes: model identity, capabilities, context limits, reasoning controls, tool support, caching, token/usage reporting, streaming, structured output, and provider error mapping. **No `if (provider === 'openai')` outside the adapter** — vendor branching lives only in adapter/config.

### 7.3 Adapter families (doc 09)

Anthropic · OpenAI · Local (OpenAI-compatible/Ollama/vLLM) · GitHub · Browser · Research · Fathom · Slack · Gmail · Drive · GHL/Zenoflo · Lead Builder · Memory/Knowledge · Coding Agent · Automation/MCP.

### 7.4 Local node contract

Nodes expose **authenticated, private** health/capability/inference endpoints (OpenAI-compatible where practical). Node credentials are **service/machine credentials, not user credentials** (doc 07/09). Adapters receive only **minimum scoped credentials** for the task; secrets never leave the secrets boundary.

### 7.5 Provider-independence obligation

For each core capability, tests/docs must answer: *"If this provider disappeared tomorrow, which adapter replaces it and what degrades?"* No model/memory/browser vendor may become irreplaceable (V2-026, §16).

---

## 8. Security model

Doc 10. Zero-trust, injection-boundaried, secret-safe.

- **Identity/access:** individual accounts, MFA, least privilege, tenant isolation, server-side RBAC/ABAC, audited admin actions, **no shared credentials**.
- **Zero-trust compute:** team users access Donna only; never the Dell/Omen directly. Nodes connect via **private encrypted mesh with service identity**; **no public Ollama/inference/RDP ports** (V2-020).
- **Prompt-injection boundary (V2-023):** email, web pages, Slack, docs, browser content, GitHub issues, retrieved text are **UNTRUSTED DATA**. `packages/security` tags all external content; the orchestrator treats it as data. External content **cannot** become policy, grant permission, change authority, reveal secrets, or instruct a control bypass. Tool outputs are data unless produced by trusted policy code.
- **Secrets:** secrets manager + scoped credentials + rotation/revocation. **Never** in semantic memory, logs, artifacts, prompts, or source control. `.env.example` holds names only.
- **High-risk actions:** deterministic approval + exact-scope confirmation; browser/computer agents get minimum permissions; destructive actions get stronger safeguards + idempotency/recovery.
- **Web security audit surface:** SSRF, XSS, CSRF, unsafe rendering, malicious file handling, path traversal, command injection, insecure tool execution, webhook validation, dependency/supply-chain.
- **Environments:** LOCAL / DEV / STAGING / PRODUCTION separated; production credentials/actions more restricted; agents can't casually cross environments.
- **Retention/privacy:** defined for chats, client data, transcripts, screenshots, browser captures, logs, embeddings, backups, deleted users/projects. Screen capture requires visible controls + per-app exclusions.

---

## 9. Compute model (distributed, cloud-authoritative)

Doc 11, V2-016..V2-020.

- **Cloud control plane + authoritative state are always available.** Local machines are **compute workers, never authoritative servers** and never sole storage.
- **Nodes & modes:**
  - **Dell XPS 8960** (i7-14700, 64GB, RTX 3050-class, Win 11 Pro) — intended **always-on `AUTO`** node. *Verify actual VRAM/driver telemetry at deployment* (V2-017).
  - **HP Omen 16** (i7-14650HX, 64GB, RTX 4060 laptop, Win 11) — optional travel node with **`AUTO / OFF / LOCAL_ONLY`**.
  - `AUTO`: may receive work when online/healthy and policy allows. `OFF`: no new jobs, drain per policy. `LOCAL_ONLY`: owner uses the machine, company router cannot dispatch to it.
- **Heartbeat/health:** authenticated heartbeat with status, models/capabilities, CPU/RAM/GPU util, free VRAM, temp, power/battery, current jobs. **Missing heartbeat auto-removes the node from routing.**
- **Resource-aware routing:** online ≠ available. Router weighs load, free VRAM, active foreground user, power state, temperature, queue — and avoids disrupting foreground use.
- **Private network:** encrypted mesh (Tailscale-equivalent, WireGuard); nodes make secure outbound/private connections as service identities.
- **Failover:** Omen down → Dell or API; Dell down → Omen (if allowed) or API; both down → cloud APIs. **Control plane never depends on home power/internet.**
- **Future nodes** (office GPU server, rented GPU burst, Mac/local server) plug in without changing product logic.

---

## 10. Model-routing model

Doc 04/12. **Invoked only after the Work Router decides AI is the right execution class.**

- **Reasoning tiers 0–10:** 0 deterministic; 1–2 trivial; 3–5 routine/moderate; 6–7 difficult; 8–9 expert/high-stakes; 10 exceptional. Tiers map to models/effort **dynamically from evaluations**, not permanent brand assumptions.
- **Routing inputs:** task class, required capabilities, reasoning difficulty, privacy, context size, tool/coding/vision needs, latency, node/provider availability, historical quality, budget, user/project policy.
- **Local-first candidates:** classification, extraction, embeddings, reranking, lead scoring, transcript chunking/summarization, memory compression, tagging, dedupe, simple drafting, structured transforms — **when local quality is adequate**.
- **Model pool:** Anthropic API, OpenAI API (approved reasoning/frontier models), local Dell/Omen models, future providers — all behind adapters. **Model names + pricing are configuration data (`packages/config`), not hard-coded architecture.**
- **Fallback/escalation:** every route has an ordered fallback chain; an outage or offline node must not strand core functionality.
- **Shadow transition:** preserve the current Claude-quality baseline; run cheaper/local alternatives in **shadow evaluation**; only shift a workload downward when the cheaper route **consistently meets the acceptance threshold**. Retain frontier APIs for hard/high-risk work. *Cheaper is never accepted merely because it is cheaper.*

---

## 11. Cost controls

Doc 12, V2-012.

- **Cost Governor** enforces budgets at **organization / project / user / objective-task / provider-model** levels. Policies: max escalation tier, max reasoning effort, context/token budget, retry caps, local-first preference.
- **UsageLedger** records estimated **and** actual cost per call (input/cached/output/reasoning tokens, tool/compute cost, latency).
- **ModelEvaluation** builds the empirical **cost-quality frontier** the router learns from (task type, model/node, reasoning level, usage, latency, cost, checker score, acceptance/correction, failure).
- **Token efficiency:** Context Packets + retrieval + summarization/compression + minimal tool schemas + provider caching. Never re-send whole company/project histories.

---

## 12. Context / memory / knowledge architecture

Doc 05, V2-005/V2-011. **Four distinct systems — kept separate on purpose.**

1. **Company State** — authoritative structured facts (Postgres). The system of record.
2. **Knowledge Base** — documents, SOPs, GitHub, Drive, Fathom, Slack source material **with provenance**.
3. **Memory** — learned preferences, decisions, relationships, history, useful semantic context.
4. **Working Context** — the temporary **Context Packet** assembled per objective/task.

- **Memory graph:** People ↔ Companies ↔ Projects ↔ Meetings ↔ Decisions ↔ Tasks ↔ Documents ↔ Communications ↔ Leads ↔ Skills. Every durable memory stores **source, timestamp, confidence, scope/permissions, version/history**.
- **Context budgeting:** the Context Builder ranks and selects (identity/role, current objective, authoritative state, relevant project facts, retrieved knowledge/memory, required skill/SOP, recent meaningful events, only necessary tool defs) under a **per-task token budget**, and records what was included. Never send entire company history by default.
- **Cache tiers:** `STATIC` (constitution, policies, role defs, stable tool schemas, approved SOPs) / `SEMI-STABLE` (project/client context) / `DYNAMIC` (current request, fresh events, live data). Arrange provider prompts to maximize safe cache reuse **without** letting stale dynamic data read as current.
- **Source confidence** preserved end to end: `AUTHORITATIVE | PRIMARY | DERIVED | INFERRED | UNVERIFIED`. A database fact is never conflated with an AI inference.
- **Write policy:** models *propose* memory writes; **policy decides** what becomes durable. High-impact decisions and SOP/policy changes require explicit validation/approval. **Prompt-injected external content can never rewrite policy or memory authority** (doc 05/10).
- **Deletion:** removing/expiring a source triggers cleanup/invalidation of associated embeddings, indexes, derived memory (retention policy).
- **Secrets** never enter semantic memory or prompt history beyond strictly required secure execution boundaries.

---

## 13. Team Donna model

Doc 07, V2-003/V2-004/V2-014/V2-015.

- **One Donna Core**; each user gets a **personalized scoped experience** (role, responsibilities, projects, permissions, private context, priorities, preferences, working style, approved skills, authority). Same identity, different authorized lens — **no competing copy of company truth**.
- **Shared truth stays shared** (per permissions); **private context stays private** unless intentionally promoted/shared.
- **Delegation contracts (V2-014):** Donna-to-Donna work transfer creates a structured **Delegation** record (objective/task, requester, owner, priority, DoD, due, dependencies, resources, authority, escalation, status) — never a conversational handoff alone.
- **Human availability:** working hours, calendar, explicit status, workload, role may route work. **No invasive surveillance** (no keystroke/location tracking required).
- **Executive view:** leadership Donna summarizes org blockers, approvals, at-risk work, dependencies, commitments, judgment items — **without exposing private content outside policy**.
- **Team view:** each member sees their seat's relevant work, objectives, dependencies, requested approvals, next actions. Reduce navigation, don't reproduce every backend screen.
- **Human routing:** Work Router may assign to a human when judgment/relationship/ownership/policy requires; Donna follows task/delegation state, never impersonates the human.
- **Global access (V2-015):** users authenticate to the **cloud app only**; they never authenticate to Dell/Omen. Local compute is infrastructure hidden behind the control plane.

---

## 14. Deployment architecture

Doc 10/14, V2-024.

- **Environments:** `LOCAL` (dev laptop + docker Postgres/pgvector), `DEV`, `STAGING`, `PRODUCTION` — isolated credentials/data. Production writes/deploys carry stronger policy; agents can't cross environments casually.
- **Topology:**
  - Web → CDN/edge (Vercel/Netlify) **[DECISION]**
  - control-plane API + worker runtime → always-on container host (Fly.io/Railway/VPS) **[DECISION]**
  - Postgres + pgvector + object storage + auth → Supabase (managed)
  - secrets → secrets manager
  - local nodes → Dell/Omen over private mesh, reaching the control plane outbound only
- **Feature flags (V2-024):** every new autonomous/capability feature ships behind a flag with staged rollout (Jeremy/admin → internal testers → selected teams → org → broader) and rollback **without destructive schema changes**.
- **No destructive migration/deploy or authorization change without explicit approval** (STOP conditions).

---

## 15. Observability (Donna Health)

Doc 14, V2-020(obs).

- **OpenTelemetry** traces/metrics/logs across API, workers, adapters.
- **Donna Health admin view** reports: control plane, database, queue, memory/knowledge, integrations, Dell/Omen status, provider status, running/blocked jobs, approvals, failures, API/local usage, cost, cache effectiveness, and **estimated local-routing savings**.
- Metrics derive from the **event stream** (event-sourced observability) + node heartbeats + UsageLedger.
- **Success metrics tracked** (doc 01): task completion quality, acceptance-without-correction, time-to-completion, cost per accepted task, API/local utilization, cache hit rate, context-token efficiency, escalation rate, retry/failure rate, approval latency, corrections, reliability, security incidents, % repeated workflows promoted to skills.

---

## 16. Testing & acceptance

Doc 16.

- **Baseline done:** typecheck/lint/tests pass; auth/tenant isolation verified; no secrets committed; migrations reviewed/reversible; loading/empty/error/blocked/approval/degraded states exist; server-side permissions enforced; material actions audited; docs updated; no undocumented mocks/placeholders.
- **Control plane:** objectives/tasks survive browser close/restart; events reconstruct execution state; worker failure recovers without losing the objective; retries don't duplicate protected side effects.
- **Work Router:** deterministic task avoids unnecessary LLM; human-owned task delegates correctly; AI task reaches Model Router only when AI is selected.
- **Model Router:** capability/budget/privacy/availability routing; context-budget enforcement; usage/cost capture; provider caching where supported; quality telemetry; fallback/escalation.
- **Local compute:** Dell offline doesn't break Donna; Omen `AUTO` works when healthy, `OFF` prevents routing, `LOCAL_ONLY` prevents company dispatch; missing heartbeat removes node; API fallback succeeds.
- **Team/security:** cross-tenant access fails; private memory unreadable by unauthorized members; team users can't reach node credentials; high-risk action can't execute without approval; **prompt-injected instructions cannot grant authority or expose secrets**.
- **Provider independence:** simulate Anthropic down, OpenAI down, local nodes down, semantic-memory down — Donna stays usable in defined degraded mode.
- **Backup/recovery:** documented, tested restore before claiming production readiness.
- **Quality/cost:** migrated workloads compared to baseline on accepted quality, correction rate, latency, cost — cheaper is not auto-accepted.
- **Test tooling [DECISION]:** Vitest (unit/integration), Playwright (E2E/browser), dedicated suites under `tests/` for tenant-isolation, provider-independence, injection, durability.

---

## 17. Rollback / recovery strategy

Doc 14, V2-024.

- **Reversible migrations** by default; destructive steps gated on explicit approval + tested rollback.
- **Feature flags** enable instant capability rollback without schema changes.
- **Backup/DR:** back up relational DB, object storage, config, versioned skills/docs. Secrets have a secure recovery/rotation strategy. **Define & test RPO/RTO** during implementation. Local machines are never sole storage.
- **Kill switches** (§6.4) give immediate operational rollback of autonomous behavior.
- **Checkpointed jobs** resume rather than restart after recovery.

---

## 18. Implementation phases (greenfield-adapted)

Adapted from doc 15. Doc 15's "audit the existing repo" (Rule Zero) becomes, per doc 18, **greenfield scaffolding + a *separate, later* legacy-audit pass** (§21) — the legacy repos are reference material, not the base.

Each phase must state: user-visible outcome · reused code · files changed/added · schema/migrations · APIs/adapters · permissions/security · tests · acceptance criteria · risks · rollback/recovery · dependencies. **Approval gates precede irreversible or architecture-changing work.**

| Phase | Name | Outcome |
|---|---|---|
| **0** | **Foundation scaffolding** | Monorepo, tooling, CI boundary rules, `core-domain` types/state machines, dev docker Postgres+pgvector, env/secret conventions, ADR log. *(No product behavior yet.)* |
| **1** | **Control-plane foundation** | Organization/identity/scopes; Objective/Task/Event model; durable queue + transactional outbox; audit; idempotency; feature flags. Minimal UI. |
| **2** | **Donna command experience** | Persistent command bar, Active Workspace, Donna Rail, context nav, task/objective visibility, approvals UI. |
| **3** | **Work Router + adapter foundation** | Capability registry, stable adapter contracts, deterministic vs human vs AI routing, health/fallback normalization. |
| **4** | **Model Router + cost/context** | Anthropic/OpenAI adapters, Context Packets, caching, budgets/cost ledger, quality telemetry, reasoning/escalation policy. |
| **5** | **Local compute** | Dell node first (mesh, service identity, heartbeat, local endpoint, auto API fallback); then Omen with `AUTO/OFF/LOCAL_ONLY` + resource-aware routing. |
| **6** | **Memory / knowledge** | Authoritative-state separation, ingestion/provenance, semantic memory adapter, scopes, retention/deletion. |
| **7** | **Team Donna** | Personalized role contexts, delegation contracts, human availability, private/team/project/org scopes. |
| **8** | **Skill Registry** | Versioned skills, SOP promotion workflow, checker/fallback/permission rules. |
| **9** | **Capability expansion** | Browser/research, GitHub/coding, Fathom/Slack/Drive/Gmail/GHL, Lead Builder, more tools. |
| **10** | **Desktop / voice / screen** | Tauri shell, push-to-talk, explicit screen context, detachable multi-monitor workspaces. |
| **11** | **Optimization** | Shadow model evaluation, empirical routing, cost reduction, reliability hardening, optional rented-GPU burst. |

---

## 19. Skills & SOPs (doc 13)

- Reusable capability = a **versioned Skill**, not a prompt. Fields: id/name/version/owner, purpose, trigger/eligibility, inputs, required context, required capabilities, ordered steps/work graph, tools/adapters, permissions, approval rules, DoD, checker/validation, fallback/escalation, cost class/budget, outputs/artifacts, memory-write rules, supported roles/teams, status(draft|approved|deprecated).
- **SOP promotion lifecycle:** observed pattern → Donna proposes *Draft Skill* → human review/edit → approved version → assigned availability → measured execution → version/deprecation. **Donna never silently turns observed behavior into binding policy.**
- **Versioning:** executions retain their SkillVersion; material change = new version; rollback possible; architecture/policy-affecting changes also recorded in the Decisions Log.
- **Portability:** skills reference **abstract capabilities/adapters**, not hard-coded models/tools.

---

## 20. Reliability & operations (doc 14)

Degraded-operation matrix (Dell↔Omen↔API; Anthropic↔OpenAI↔local; memory engine down → authoritative state continues; integration outage → queue/retry when safe); durable queues + leases + checkpoints; observability; backup/DR with tested restore; kill switches; feature flags; environment separation; artifact provenance. **Reliability is a product feature** — an objective must never be lost because a browser closed.

---

## 21. Legacy-reuse candidates (REFERENCE / REUSE / DISCARD)

Per doc 18, legacy repos (`gdvansky/KOBTEAMLLM`, `jerkean2139/Kob-command-center-v2`) and older Drive artifacts are **reference only**. The formal audit is a **later, approved pass** (not part of this greenfield foundation) and each candidate must be verified against V2 boundaries — license, tests, security posture, dependencies, tenant assumptions — before any port. Existing behavior is **not** automatically a V2 requirement.

Provisional candidates observed (names only — **not yet inspected**, classifications are hypotheses to test during the audit):

| Candidate (observed) | Provisional class | Notes to verify during audit |
|---|---|---|
| `donna-intelligence.ts` / `donna-ai-engine.ts` | **REFERENCE** | Likely V1 model-call logic that conflates orchestration + model use; V2 splits these across Work Router / Model Router / adapters. Study for domain insight, do not port wholesale. |
| `donna-memory.ts` (+ `donna-memory` folder, `.routes.ts`) | **REUSE CANDIDATE** | Only if it cleanly maps to the V2 Memory adapter + provenance/confidence/scope model and never acts as authoritative store. |
| `donna-evaluation.ts` / `011_donna_evaluation_scores.sql` | **REUSE CANDIDATE** | Evaluation scoring may inform `ModelEvaluation`; re-shape to V2 schema, don't inherit table shape. |
| UI: `donna-chat-flyout.tsx`, `donna-voice-mode.tsx`, `donna-avatar.tsx`, `donna-typing-indicator.tsx`, `donna-proactive.tsx`, `donna-analysis.tsx` | **REFERENCE** | Command-first V2 UX differs from a chat flyout; salvage components selectively, not the layout. |
| V1 directory structure / orchestration / permission semantics | **DISCARD** as a base | Doc 18: no inherited architecture/structure by default. |

**Rule:** to reach the codebase, a legacy component needs a concrete V2 need, a documented behavior/test/license/security review, a bounded scope, and (if it changes architecture/risk) approval + a Decisions-Log entry.

---

## 22. Open questions (need Jeremy's decision)

These are the points where the Bible left a choice open or where my recommendation should be confirmed before Phase 0:

1. **Hosting for the always-on tier** — Fly.io vs Railway vs a VPS for control-plane API + workers? (Durable workers rule out pure serverless.) *Recommendation: Fly.io or Railway to start.*
2. **Durable-job engine** — start with **graphile-worker** (Postgres-native, minimal infra) and keep **Temporal** as a documented upgrade, or invest in Temporal from day one? *Recommendation: graphile-worker first.*
3. **Auth provider** — Supabase Auth vs Auth.js vs Clerk (all support MFA)? *Recommendation: Supabase Auth to stay in one platform.*
4. **ORM** — Drizzle vs Prisma? *Recommendation: Drizzle (SQL-first, reversible migrations, lighter).*
5. **Postgres RLS** — enable as defense-in-depth alongside the app-layer policy engine? *Recommendation: yes.*
6. **Web framework** — React+Vite SPA vs Next.js? *Recommendation: React+Vite SPA (backend-independent, desktop-shell-ready).*
7. **Model pool & pricing config** — which exact Anthropic/OpenAI models are approved for the pool, and starting budget defaults per org/project/user? (Names/pricing are config, but need seed values.)
8. **Retention & DR targets** — concrete retention windows (chats, transcripts, screenshots, embeddings, logs, backups) and **RPO/RTO** targets.
9. **Initial roles & authority mapping** — confirm the five roles and which actions sit at Authority Level 3 (approval) vs 4 (never autonomous) for KOB specifically.
10. **Local inference runtime** — Ollama vs vLLM on Dell/Omen (affects the OpenAI-compatible node contract) and which local models to seed.
11. **Mesh choice** — Tailscale vs self-hosted WireGuard for the node network.
12. **Lead Builder / GHL-Zenoflo / Fathom / Slack / Gmail / Drive** — which integrations are Phase-9 must-haves vs later, and are there API/account constraints?
13. **Voice provider** — for push-to-talk (Phase 10): which STT/TTS, and any privacy constraints?
14. **Legacy audit timing** — schedule the KOBTEAMLLM / Command-Center audit pass as its own approved milestone (recommended after Phase 1), or earlier?
15. **Object storage** — Supabase Storage vs S3/R2 for artifacts, transcripts, captures?

---

## 23. What happens on approval

On Jeremy's explicit approval of this plan, work begins at **Phase 0 (Foundation scaffolding)** only — monorepo, tooling, CI boundary rules, `core-domain` types, dev database, and the ADR/Decisions-Log mirror — with **no product behavior and no destructive or authorization-changing steps**. Each subsequent phase is proposed with its own acceptance criteria and stops at the approval gates defined above.

**Per docs 15, 16 and 18, implementation is paused here pending that approval.**

---

*Prepared from the DONNA Build Bible V2 (docs 00–18). This plan asserts no changes to production infrastructure, authentication/authorization, or data. It is a design proposal only.*
