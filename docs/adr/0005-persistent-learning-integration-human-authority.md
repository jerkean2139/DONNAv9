# ADR-0005 — Persistent learning, integration intelligence, and human authority

- **Date:** 2026-09-23
- **Status:** Accepted
- **Approver:** Jeremy

## Decision

DONNA v9 will treat persistent layered memory, policy-gated learning, integration
intelligence, client memory lifecycle, and human authority as core architecture.

The operating objective is deliberate assistance rather than complete autonomy:

> Donna performs the 80–90% heavy lifting. Humans retain judgment and
> authorization over consequential actions.

This ADR extends ADR-0004. It does not replace the Agent Factory or existing
control-plane boundaries.

## Persistent layered memory

Keep authoritative state, sourced knowledge, semantic memory, episodic memory,
procedural memory, preferences/judgment memory, relationship/graph state, and
working context distinct.

Memory is persistent but has lifecycle. Supported lifecycle states include
candidate, active, dormant, archived, and superseded.

Archive is not delete. Archived client intelligence is retained for deliberate
retrieval and possible future reactivation but is excluded from normal active
retrieval.

Reactivation requires revalidation of stale facts, people, systems, procedures,
and permissions.

## Learning Engine

Donna learns through a policy-gated loop:

1. Observe a conversation, event, correction, completed task, or outcome.
2. Extract a candidate learning.
3. Attach evidence, provenance, subject, scope, confidence, and sensitivity.
4. Compare against authoritative state and existing memory.
5. Reject, propose new knowledge, propose an update, or propose supersession.
6. Apply deterministic policy.
7. Store only when permitted; otherwise request human approval.
8. Make validated learning available to future Context Packets.

Models may propose learning. They may not silently rewrite authoritative state,
the Business Constitution, tenant boundaries, permissions, or delegated
authority.

Repeated human approval is evidence of a pattern, not automatic delegation.

## Integration Intelligence

Donna will maintain a governed Tool/Integration Registry for internal and
external systems, including APIs, OpenAPI/Swagger, MCP, approved
plugins/connectors, OAuth/API connections, webhooks, and internal Zenoflo/KOB
applications.

The registry describes what a system is, which tenant owns the connection, what
objects/capabilities/events it exposes, what authority each operation requires,
its risk class, documentation/provenance, version, health, and approval state.

Donna may generate proposed machine-readable Tool Manifests and human-readable
API documentation from approved API specifications or documentation.

Technical connector permission never equals operational authority.

Secrets and credentials remain in the secrets/connection layer and never enter
memory, prompts, Skills, traces, or generated documentation.

## KOB Marketplace

The KOB Marketplace GitHub repository is a capability library and source of
candidate Skills, prompts/loops, evaluators, MCP definitions, API/connector
definitions, and documentation.

Repository presence does not make content trusted or active.

Marketplace content must be versioned, provenanced, tested, risk-classified,
permission-scoped, and approved before Donna can use it operationally.

Skills cannot grant themselves authority.

## Human Authority Doctrine

Use least privilege and exact scope.

Donna should read, research, organize, analyze, draft, prepare, recommend, and
complete approved low-risk work aggressively. Consequential actions are governed
by deterministic policy and human approval where required.

For consequential operations:

`propose -> preview -> verify scope -> risk check -> approve -> execute exact scope -> verify -> audit -> learn`

Approval for one scope cannot authorize a materially different scope.

Workers, models, Skills, connectors, external events, and the Learning Engine
may request authority but cannot grant it.

## Destructive actions

Use an additional Destructive Action Gate.

Prefer reversible operations where supported:

`disable -> archive -> trash/soft-delete -> permanent delete`

Permanent deletion, bulk destructive actions, permission/security changes,
financial actions, and material customer-facing changes normally require
explicit human approval.

Paying-customer systems and GoHighLevel sub-accounts require strict tenant,
resource, and action scoping.

## Client lifecycle

Client intelligence follows an explicit lifecycle:

`prospect -> onboarding -> active -> paused/dormant -> offboarding -> archived -> reactivation`

Onboarding starts read-only and proposes learned structure for human correction.

Offboarding creates an auditable archive package, transitions client-specific
memory out of active retrieval, and revokes/disables access according to policy.

Reactivation revalidates archived information before restoring it to active use.

## Interfaces

Voice, chat, desktop/PWA, and API are interfaces to the same Donna. They do not
maintain independent business brains, memory stores, or authority models.

## Productization boundary

DONNA v9 proves the working system first.

A future Donna Blueprint may extract the proven minimum stack into a reusable
client deployment template. Client data, credentials, memory, relationships,
permissions, and integrations remain isolated per tenant.

## Consequences

- persistent memory and learning move earlier in the implementation sequence.
- planned packages include dedicated learning and integration-registry layers.
- Skills 2.0 design must account for KOB Marketplace compatibility.
- memory schema must support lifecycle, provenance, confidence, sensitivity, and
  supersession.
- connector/tool manifests must declare capabilities and risk without granting
  authority.
- client onboarding/offboarding/reactivation become first-class workflows.
- destructive-action and bulk-operation tests become production gates.
- no production schema migration or deployment is authorized by this ADR.
