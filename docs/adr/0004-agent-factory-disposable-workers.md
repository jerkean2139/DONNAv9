# ADR-0004 — Adopt Agent Factory and disposable-worker architecture

- **Date:** 2026-09-23
- **Status:** Accepted
- **Approver:** Jeremy

## Decision

Evolve DONNA v9 in place instead of rebuilding it.

Keep the existing control-plane architecture and add:

- an Agent Factory that compiles Tasks into immutable/versioned AgentSpecs.
- Skills 2.0 as reusable, versioned execution recipes.
- temporary disposable AI workers.
- independent Judge/Evaluator behavior.
- bounded refinement loops.
- Business Graph and Business Constitution layers.
- explicit knowledge/memory separation.
- evidence-based risk and authority disposition.
- researched Approval Inbox packets.
- event-driven task initiation and tenant onboarding.

The control-plane, relational state, policy engine, Work Router, Model Router,
provider adapters, Context Packets, events/outbox, cost controls, and tenant
boundaries remain foundational.

## Core invariant

> Donna is permanent. Workers are disposable. Skills are reusable. Business state
> is authoritative. Models are replaceable. Humans retain authority over
> consequential decisions.

## Agent authority

A model may propose plans, AgentSpecs, actions, memory writes, or Skill changes.

Models may not grant authority, modify policy, change tenant boundaries, approve
their own high-consequence actions, or make themselves permanent.

Deterministic code validates the intersection of:

- user authority.
- organization policy.
- platform policy.
- Skill requirements.
- capability availability.
- action consequence and reversibility.

## Worker/Judge separation

The worker that produces an output is not the sole authority that accepts it.

Important work is evaluated by an independent Judge, deterministic verifier, or
both. Refinement is bounded by attempts, time, cost, and policy.

## Skills

Skills are not merely prompt fragments.

A versioned Skill may define context requirements, tools, workflow, output
schema, definition of done, evidence rules, evaluation rubric, failure modes,
and escalation behavior.

Skills cannot grant themselves tools or authority. Promoting a learned workflow
into an approved Skill requires explicit approval.

## Memory

Authoritative state, knowledge, semantic memory, episodic memory, procedural
memory, and working context remain separate concepts.

Semantic/vector storage never becomes the sole system of record.

## Reason

The existing DONNA v9 architecture already implements the difficult control-plane
foundations needed for this design. Rebuilding would discard working tenant,
routing, policy, queue, adapter, and persistence boundaries while adding little
architectural value.

Disposable workers also reduce the need to maintain a large permanent "agent
mob." Donna retains durable company context while creating only the specialist
worker required for the current task.

## Alternatives considered

- Keep a permanent roster of specialist agents.
  Rejected as the default because it duplicates context and increases drift.
- Rebuild DONNA around a provider-specific agent framework.
  Rejected because providers must remain replaceable.
- Let each worker self-grade and self-modify.
  Rejected because it weakens independent verification and governance.

Permanent services remain appropriate for truly recurring monitors and
deterministic capabilities. The decision is against permanent AI personas as
the default execution model, not against durable services.

## Consequences

- `packages/agent-factory` becomes a new package.
- the planned `packages/skills` scope expands to Skills 2.0.
- future schema work adds AgentSpec/run, organizational-intelligence, knowledge,
  and memory entities.
- model routing remains downstream of Work Router.
- existing approval and tenant boundaries remain mandatory.
- new autonomous action types remain disabled until explicitly approved.
- no production migration is authorized by this ADR.

## Affected docs

- `DONNA-V9-AGENT-FACTORY-MASTER-PLAN.md`
- `GREENFIELD-V2-TECHNICAL-PLAN.md`
- `docs/repository-structure.md`
- `docs/PHASE-0-BASELINE.md`
