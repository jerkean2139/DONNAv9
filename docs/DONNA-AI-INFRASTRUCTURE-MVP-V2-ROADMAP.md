# DONNA V9 — AI Infrastructure MVP + V2 Roadmap

**Status:** FROZEN MVP DIRECTION — implementation audit baseline  
**Date:** 2026-10-05  
**Repository baseline:** `a830ec9f7297a52d682ccd689d4c596f34d367d1`  
**Purpose:** Define the minimum AI compute/routing foundation for DONNA V9, identify what already exists, separate MVP from V2, and prevent duplicate infrastructure.

## 1. Objective

DONNA must deliver the required quality and safety at the **lowest total cost per successful task**, not merely minimize token price or API usage.

Canonical execution hierarchy:

```text
DETERMINISTIC CODE / SQL / RULES
  -> EXACT / DERIVED CACHE
  -> LOCAL LIGHT MODEL
  -> LOCAL GPU MODEL
  -> CHEAP CLOUD MODEL
  -> GENERAL FRONTIER MODEL
  -> ADVANCED REASONING / SPECIALIST MODEL
```

A model call is a cost and risk decision. It is not the default execution mechanism.

## 2. Target topology

```text
DONNA / KOBTEAMLLM / JEREMY-OS / CLIENT PORTALS
                       |
                       v
               DONNA AI GATEWAY
            auth + tenant + policy
                       |
                       v
               DATA CLASSIFICATION
                       |
                       v
                CONTEXT COMPILER
                       |
                       v
                  WORK ROUTER
            "Does this need AI?"
                       |
          +------------+-------------+
          |                          |
          v                          v
  deterministic/cache          MAXIMUM LOGIC
                                  ROUTER
                                    |
                       +------------+-------------+
                       |            |             |
                       v            v             v
                 local light   desktop GPU   cloud/API
                       |            |             |
                       +------------+-------------+
                                    |
                                    v
                           OUTPUT VALIDATION
                                    |
                                    v
                            ACTION RISK GATE
                                    |
                                    v
                                  USER
                                    |
                                    v
                         USAGE + COST LEDGER
                                    |
                         +----------+----------+
                         |                     |
                         v                     v
                    ROUTER AUDITOR        DASHBOARD
                         |
                    sampled shadow
                       testing
                         |
                         v
                  POLICY RECOMMENDATION
                         |
                         v
                    HUMAN APPROVAL
```

## 3. Physical compute plan

### Stage 1 — existing hardware, MVP

**Ubuntu 8 GB microcomputer — AI Control Plane 01**
- always-on gateway/control-plane candidate
- routing and policy
- cache coordination
- queues
- worker registry / heartbeats
- usage and cost telemetry
- lightweight inference only where benchmarks support it

**Jeremy desktop GPU — AI Worker 01**
- local OpenAI-compatible inference endpoint
- larger local models based on actual GPU/VRAM
- may be offline without breaking DONNA
- health/availability determines router eligibility

**Railway**
- remains application/database/worker production platform
- no migration away from Railway is part of this MVP

**Cloud APIs**
- escalation tier, not default tier
- Anthropic/OpenAI remain available for work where frontier quality earns its cost

### Stage 2 — V2 burst compute
- rented GPU providers, including evaluation of Hostinger GPU and specialist GPU clouds
- automatic economics comparison
- automatic start/stop only after safe provider controls and measured demand exist

### Stage 3 — V2 owned GPU expansion
Purchase only after telemetry proves sustained utilization and break-even. Do not select hardware from parameter counts alone.

## 4. Repository-verified foundation already present

The following are **KEEP / EXTEND**, not rebuild:

| Capability | Repository evidence | Status |
|---|---|---|
| Work Router above Model Router | `packages/work-router`, architecture docs | EXISTS |
| Model Router | `packages/model-router/src/router.ts` | EXISTS / EXTEND |
| Model registry | `packages/config/src/models.ts` | EXISTS / REFRESH |
| Anthropic adapter | `packages/adapters/model-anthropic` | EXISTS |
| OpenAI adapter | `packages/adapters/model-openai` | EXISTS |
| Local OpenAI-compatible adapter | `packages/adapters/model-local` | EXISTS |
| Context Packet budgeting | `packages/context/src/packet.ts` | EXISTS / EXTEND |
| Cost governor primitives | `packages/cost-governor` | EXISTS / EXTEND |
| Budget checking | `packages/cost-governor/src/budget.ts` | EXISTS / EXTEND |
| Usage/evaluation types | `packages/cost-governor/src/ledger.ts` | EXISTS / MAKE DURABLE |
| Adapter health contract | `packages/adapters/base/src/contracts.ts` | EXISTS / EXTEND |
| Structured response schema contract | adapter base `ModelRequest.responseSchema` | EXISTS / ENFORCE |
| Risk model | objective/task schema | EXISTS |
| Approval/audit model | governance schema | EXISTS / WIRE FULLY |
| Multi-tenant DB protections | DB schema + baseline report | EXISTS |
| Feature flags | governance schema | EXISTS |
| Worker/orchestrator architecture | `apps/worker`, `packages/orchestrator` | EXISTS |
| Event/outbox architecture | `packages/events`, DB schema | EXISTS |
| KOB PM integration foundation | control-plane integrations + worker reconciliation | EXISTS |

## 5. Critical gaps found in this audit

### GAP A — Router objective is too narrow
Current Model Router primarily filters eligibility and chooses the cheapest eligible model by output/input token price.

MVP must evolve selection toward:
- required quality
- reasoning complexity
- action risk
- privacy/data class
- context size
- capability requirements
- health/availability
- predicted latency
- expected total cost
- historical acceptance rate
- expected **cost per accepted result**

Do not use an LLM to make every routing decision. Deterministic policy is first; a cheap classifier is allowed only for genuinely ambiguous classification.

### GAP B — Durable AI economics ledger
The current `UsageLedger` is an in-memory primitive. MVP needs persistent records with at least:
- organization / tenant
- user
- project/client when known
- task/objective
- feature/task class
- route/policy version
- provider/model
- input tokens
- cached input tokens
- cache-write tokens where reported
- output tokens
- reasoning tokens where reported
- token-count provenance
- latency
- retries
- fallback/escalation
- local GPU seconds / worker
- estimated and actual cost
- quality/acceptance signals
- success/failure

Token provenance values:
- `PROVIDER_REPORTED`
- `TOKENIZER_CALCULATED`
- `HEURISTIC_ESTIMATE`
- `HARDCODED_ESTIMATE`
- `UNKNOWN`

### GAP C — Baseline mode
Before optimization claims, capture a baseline window. Compare baseline vs optimized:
- cost per successful task
- first-pass acceptance
- model/API spend
- tokens in/out/cached
- local vs cloud share
- latency
- retries
- human corrections

No invented savings percentages.

### GAP D — Router Decision Receipt
Every routed request needs an auditable decision record:
- task class
- complexity
- risk
- privacy
- candidates considered
- selected route
- reason
- router policy version
- expected cost/quality/latency
- actual outcome
- escalation/fallback
- user acceptance signal

### GAP E — Router Auditor
MVP needs an evaluator that audits a **sample** of routing decisions. It must not second-guess every production request with another expensive model.

Score:
1. quality
2. cost efficiency
3. escalation accuracy
4. latency
5. deterministic/cache opportunity

Track both:
- **under-routing** — selected model cannot meet quality threshold
- **over-routing** — expensive model used when cheaper route passes

The auditor itself has a budget.

### GAP F — Golden Test Suite
Create 100–250 representative real tasks across:
- deterministic PM/status
- extraction/classification
- summarization
- rewriting
- content
- normal coding
- difficult debugging
- architecture
- business strategy
- research
- document analysis
- tool actions
- compliance/high-risk reasoning

Each case defines expected execution class, minimum quality, risk, and allowed routes.

### GAP G — Caching is layered, not one feature
MVP distinguishes:
1. application/result cache
2. provider-native prompt cache
3. local inference prefix/KV cache

Stable context precedes dynamic context. Cache keys must be tenant-isolated. Do not introduce semantic answer reuse in MVP.

### GAP H — Privacy-aware routing
Add explicit data classes:
- PUBLIC
- INTERNAL
- CONFIDENTIAL
- RESTRICTED

Provider/model eligibility is policy-controlled by class and tenant. Sensitive data does not automatically leave approved infrastructure.

### GAP I — Local worker registry
A local desktop cannot be assumed online.

Track:
- worker ID
- health
- GPU/VRAM
- loaded model
- queue depth
- throughput
- temperature when available
- last heartbeat
- capability/privacy tags

Offline/degraded workers are removed from eligible routes automatically.

### GAP J — Cost accounting must include failure
Optimize **cost per accepted result**, including retries, corrections, escalations, failed tool calls, and shadow-test expense.

## 6. MVP requirements — frozen

MVP includes:

1. Existing Work Router preserved and strengthened.
2. Maximum Logic Model Router.
3. Central model/provider registry with current verified metadata.
4. Local OpenAI-compatible worker support.
5. Desktop worker health/heartbeat registry.
6. Cloud Anthropic/OpenAI escalation.
7. Context Compiler built on current Context Packet foundation.
8. Exact/derived application caching.
9. Provider-native prompt caching where supported.
10. Local prefix/KV caching where supported.
11. Persistent usage/cost ledger.
12. Token provenance.
13. Baseline mode.
14. Tenant/user/project/task attribution.
15. Privacy/data classification.
16. Budget and rate controls.
17. Timeouts, retries, fallback and circuit breakers.
18. Structured-output validation.
19. Action-risk gate and human approval for consequential actions.
20. Router Decision Receipts.
21. Golden Test Suite.
22. Router Auditor.
23. Budgeted sampled shadow routing.
24. Passive/explicit acceptance signals.
25. Versioned router policies.
26. Canary rollout for policy changes.
27. Simple AI economics dashboard.
28. Async queue for work that does not require an immediate answer.
29. Fail-safe behavior when local compute is offline.
30. No provider credentials in browsers or prompts.

## 7. Explicitly NOT MVP — V2 backlog

1. Automatic rented-GPU provisioning/destruction.
2. GPU economics engine comparing electricity, amortization, rental, and API in real time.
3. Multi-GPU scheduling.
4. 80–192 GB owned inference workers.
5. Semantic response caching.
6. Self-modifying routing policy.
7. Fully autonomous router-policy promotion.
8. Advanced A/B experimentation platform.
9. Predictive GPU prewarming.
10. LoRA/fine-tuning.
11. Continuous automated model tournament.
12. Automated model replacement.
13. Advanced speculative-decoding optimization.
14. Client chargeback/billing.
15. SLA-aware routing.
16. Cross-client learning. This requires separate privacy/legal design and must never silently mix tenant data.
17. Sophisticated batch-market optimization.
18. Hardware purchasing automation.
19. Large local frontier-equivalence claims. Models are benchmarked by task, not marketed as “X GPUs = Opus.”

## 8. Router scoring model

A route is eligible only if it satisfies hard policy constraints.

Among eligible routes, optimize expected total value using:
- minimum quality threshold
- predicted acceptance probability
- expected total cost
- expected latency
- privacy
- availability
- task/action risk

The initial policy remains deterministic and human-approved.

A cheap model/classifier may assist with ambiguous task classification but does not control policy, privacy, budget, or authority.

## 9. Evaluation rules

### Production
One selected route returns the user-visible result.

### Shadow
A bounded sample of eligible traffic may run alternate routes. Shadow outputs are not shown to users and cannot perform side effects.

### Judge
Prefer deterministic validators for deterministic criteria. For subjective criteria, use a rubric and, when justified, a different model/provider.

### Auditor budget
Shadow/evaluation spend is tracked separately. Optimization is a failure if evaluation cost exceeds the value it creates.

## 10. Quality signals

Capture passive signals where available:
- accepted
- regenerated
- substantially edited
- copied/used
- same request repeated
- manually escalated
- tool succeeded/failed
- human approval/rejection

Explicit feedback may supplement passive signals.

## 11. MVP dashboard

Minimum views:
- requests
- tokens in
- cached input
- tokens out
- local inference volume
- API inference volume
- spend by provider/model
- spend by tenant/user/project/feature
- baseline-equivalent spend
- actual spend
- cost per accepted result
- first-pass acceptance
- router quality score
- router efficiency score
- over-routing rate
- under-routing rate
- fallback/error rate
- local worker availability
- auditor/shadow spend

## 12. Implementation sequence

### Sprint AI-0 — Baseline + contracts
- refresh model registry from verified provider data
- define durable ledger + decision receipt schema
- define token provenance
- define privacy classes
- define router policy versioning
- instrument current path without changing routing behavior

**Gate:** baseline telemetry is trustworthy.

### Sprint AI-1 — Maximum Logic Router
- extend existing router rather than replace it
- deterministic-first eligibility
- quality/risk/privacy/health/cost/latency inputs
- expected cost-per-accepted-result scoring
- fallback/circuit-breaker behavior

**Gate:** Golden deterministic routing tests pass.

### Sprint AI-2 — Local compute
- configure Ubuntu control-plane role
- register desktop GPU worker
- local OpenAI-compatible endpoint
- health/heartbeat
- benchmark models appropriate to actual VRAM
- fail safely to next route

**Gate:** desktop can disappear mid-day without breaking DONNA.

### Sprint AI-3 — Context + cache
- extend Context Packet into Context Compiler
- provider prompt caching
- local prefix caching
- application result cache
- tenant-isolated keys
- measure cache-hit savings

**Gate:** no cross-tenant cache reuse; token accounting reconciles.

### Sprint AI-4 — Auditor + Golden Suite
- build representative dataset
- scoring rubrics
- bounded shadow routing
- auditor budget
- over/under-routing metrics
- decision recommendations only

**Gate:** auditor can identify deliberately bad routing policies.

### Sprint AI-5 — Economics dashboard + Donna integration
- dashboard
- baseline vs optimized
- user/team/project attribution
- Donna UI integration
- policy canary controls

**Gate:** human can explain why a model was chosen and what it cost.

## 13. Hardware information still required

Before selecting the first desktop local model, record:
- desktop GPU exact model
- desktop VRAM
- desktop system RAM
- desktop CPU
- desktop OS
- laptop GPU/VRAM if it will participate
- Ubuntu mini exact CPU/storage/network
- whether Wake-on-LAN is available/desirable

Do not block AI-0 or AI-1 on this inventory.

## 14. Acceptance definition for MVP

MVP is complete when:
- normal deterministic work can bypass models;
- local compute can serve eligible requests and disappear without outage;
- frontier APIs are escalation tiers;
- every AI request has trustworthy usage/cost provenance;
- tenant/privacy policy constrains routing;
- context/caching behavior is measurable;
- budgets/circuit breakers work;
- routing decisions are auditable;
- Golden Suite measures quality/cost/latency;
- sampled shadow evaluation can expose over/under-routing;
- routing-policy changes require human approval;
- dashboard proves baseline vs optimized economics;
- no material P0/P1 security or tenant-isolation gap remains.

## 15. Governing principle

> **Systems do deterministic work. Local compute handles what it can. Cloud models earn every escalation. The router is measured by the cost of a successful result, and the auditor is measured by whether it makes the router better.**
