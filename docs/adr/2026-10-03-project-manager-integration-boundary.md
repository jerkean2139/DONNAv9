# ADR: Donna V9 ↔ Project Manager integration boundary

**Status:** Proposed / staging audit
**Date:** 2026-10-03

## Decision

Keep DONNA V9 and the existing KOBTEAMLLM Project Manager as separate deployable services for the first integration phase. Connect them with a versioned internal HTTP API plus signed event webhooks. Donna is the intelligence/orchestration layer; Project Manager remains the operational system of record until parity and migration are proven.

Do not merge the repositories or databases yet.

## Canonical work hierarchy

Client → Project → Sprint → Task → Subtask

A sprint is the Kanban/work container for a project. Tasks may also sit in a backlog before assignment to a sprint.

## What DONNA V9 already supports

The V9 database already models the complete hierarchy:

- clients
- projects linked to clients
- sprints linked to projects
- work_items linked to projects and optionally sprints
- one-level child work_items for subtasks
- attachments at client/project/sprint/work-item level
- tenant-safe composite foreign keys using organization_id
- objective linkage for work Donna planned
- transactional event/outbox infrastructure

This is a sound foundation and does not require a rewrite.

## Existing Project Manager capabilities to preserve

The current KOBTEAMLLM PM already contains materially richer operations than the first V9 work UI:

- clients, projects, sprints, lists/Kanban containers, tasks and subtasks
- task priority, dependencies, due dates, estimates and scheduling
- individual and multi-user assignments
- task conversations/comments and project/client chat threads
- task assets and project documents
- task templates, including website and SEO/AEO/GEO checklist content
- time tracking and daily closeout
- client visibility controls
- PM activity logging
- team status / time-off handling

These capabilities must not be lost by prematurely making V9 the system of record.

## Gaps to close before V9 can replace the PM

### 1. Team assignment model

V9 work_items currently use a small owner enum (human/Donna-style ownership). The PM supports actual team-user assignment and multiple assignees. V9 needs explicit user/team assignment relations before it can replace PM task ownership.

### 2. Workflow/Kanban statuses

V9 currently has a deliberately small work-item state set. The PM has a richer operational workflow. The integration contract must define canonical statuses and a lossless mapping. Do not silently collapse PM states such as blocked, review, waiting, or approval into todo/in_progress/done.

### 3. Recurrence and templates

V9 has sprints but no first-class recurring sprint/project template model. Add this deliberately rather than hard-coding recurring tasks. The target must support monthly Visibility/website/SEO/AEO/GEO/analytics work by instantiating a versioned template into a dated sprint.

### 4. External identity mapping

The systems use different IDs and should never assume IDs match. Add an integration identity map keyed by organization, source system, entity type and external ID. This enables safe retries, reconciliation and eventual migration.

### 5. Operational event vocabulary

V9's event system is strong but its canonical event types currently focus on objectives/orchestrator tasks. Extend it for PM work events such as:
- client/project/sprint created or updated
- work_item created/updated/moved/completed/blocked
- assignment changed
- comment/message created
- attachment added
- template instantiated

Event payloads should remain referenced rather than leaking sensitive/large bodies into the event envelope.

### 6. Webhook inbox + idempotency

Add a durable inbound webhook/event inbox to Donna. Every incoming PM event must carry event_id, source, organization, occurred_at and schema_version. Store/dedupe before processing. Delivery is at-least-once, so consumers must be idempotent.

### 7. Reconciliation

Webhooks are the fast path, not the only truth. Add a low-frequency reconciliation endpoint/job that compares changed records since a cursor/watermark and repairs missed events without LLM use.

### 8. Authentication

Use service-to-service credentials stored in Railway secrets. Sign webhook bodies (HMAC or equivalent), include timestamp/nonce protection, rotate secrets, and reject cross-organization identifiers. Never expose the internal service credential to the browser.

## Proposed integration contract

### PM → Donna events

POST /internal/integrations/project-manager/v1/events

Headers:

- X-Donna-Source
- X-Donna-Timestamp
- X-Donna-Signature

Envelope:

- event_id
- schema_version
- event_type
- organization_id
- occurred_at
- entity_type
- external_entity_id
- correlation_id
- payload

Donna verifies, deduplicates, persists, acknowledges quickly, and processes asynchronously.

### Donna → PM commands

Use narrow authenticated command endpoints rather than direct database writes. Examples:

- create/update sprint
- create/update/move task
- assign task
- create comment
- instantiate template

Every command carries an idempotency key and organization scope.

## AI cost rule

Normal application behavior must not invoke an LLM.

Database reads, counters, status changes, synchronization, notifications, recurrence, webhook handling, search filters and reconciliation are deterministic software.

Call a model only for work that needs language/reasoning, such as summarizing blockers, drafting work, interpreting a request, prioritization suggestions, or answering a cross-project question.

## Migration phases

1. **Observe:** PM remains authoritative. Donna receives events and builds a read-only operational view.
2. **Assist:** Donna can propose/draft changes; human approval writes commands back to PM.
3. **Operate:** Approved Donna actions can create/update PM work through the internal API.
4. **Parity:** Add missing team assignments, workflow states, recurrence/templates, comments/files and communication features to the shared operating layer.
5. **Consolidate:** After measured parity, choose one canonical database/service and migrate. Only then retire redundant PM/Slack/Basecamp functionality.

## Release-gate conclusion

The current V9 hierarchy is compatible with the intended architecture and does **not** need to be rewritten before the staging → main release.

However, the eight gaps above are architectural requirements for the future Project Manager integration. They should be implemented as additive migrations/contracts, not by replacing the existing hierarchy.

The immediate next engineering slice after the current release candidate is:

1. integration identity map
2. signed/deduplicated webhook inbox
3. PM event vocabulary
4. read-only PM → Donna sync
5. reconciliation tests

This preserves current PM functionality while giving Donna visibility across the operating system without continuous LLM/API polling.
