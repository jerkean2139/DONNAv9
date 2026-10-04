# DONNA Ecosystem Master Architecture

**Status:** Canonical direction
**Date:** 2026-10-03
**Scope:** Jeremy-OS, KOBTEAMLLM, DONNA V9

## One ecosystem, three responsibilities

Do not merge these repositories simply because features overlap. The overlap is evidence that shared capabilities need clear ownership.

| System     | Primary responsibility                                        | Audience                              | Authority                                                                   |
| ---------- | ------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Jeremy-OS  | Jeremy's personal cockpit                                     | Jeremy                                | Personal state, personal workflow, personal interface                       |
| KOBTEAMLLM | Team and client operations                                    | Team, PMs, eventually clients         | Operational work system of record                                           |
| DONNA V9   | Intelligence, orchestration, governance and integration layer | Both applications and governed agents | Cross-system reasoning, events, approvals, agents and integration contracts |

## Canonical work hierarchy

KOBTEAMLLM remains authoritative for operational work during the integration period:

Client → Project → Sprint → Task → Subtask

DONNA V9 already has a compatible relational hierarchy. That compatibility is for orchestration, querying and eventual consolidation; it is not permission to run two independent authoritative task databases.

## Ownership matrix

| Capability                              | Jeremy-OS                           | KOBTEAMLLM                       | DONNA V9                              | Direction                                                              |
| --------------------------------------- | ----------------------------------- | -------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Personal Donna chat                     | OWNER                               | No                               | Shared intelligence                   | Keep Jeremy-OS UI; route governed intelligence through V9 over time    |
| Chat topic/session log                  | OWNER                               | No                               | Memory consumer                       | Preserve PR #125 pattern; make session boundaries available to V9      |
| Personal daily planning/focus           | OWNER                               | No                               | Assist                                | Keep personal UX in Jeremy-OS                                          |
| Personal inbox/mail UX                  | OWNER                               | No                               | Governed service/agent                | Keep cockpit; progressively centralize reusable Gmail capability in V9 |
| Personal calendar UX                    | OWNER                               | Team calendar may exist          | Governed integration                  | Jeremy-OS remains personal interface                                   |
| Voice/ElevenLabs/transcription          | OWNER UI                            | Has voice features               | Orchestration may consume transcripts | Avoid three independent voice stacks; share contracts/providers later  |
| Fathom                                  | OWNER UX today                      | No clear authority               | Future integration service            | Move reusable ingestion/knowledge capability toward V9                 |
| GHL                                     | Personal/quick actions today        | Operational use possible         | OWNER reusable adapter                | V9 already has a GHL adapter; converge here                            |
| Basecamp                                | Temporary integration               | PM replaces its operational role | Observe only                          | Retire after PM parity/migration                                       |
| Slack                                   | Temporary personal/team integration | Has rich chat + Slack sync       | Event/intelligence consumer           | Replace only after native communication parity                         |
| Clients/projects/sprints/tasks/subtasks | Consume/query                       | OWNER                            | Mirror/index/orchestrate              | PM is source of truth until explicit consolidation                     |
| Kanban/workflow                         | No                                  | OWNER                            | Observe/command via API               | Do not duplicate workflow authority                                    |
| Recurring work/templates                | Personal routines only              | OWNER operational templates      | Orchestrate/instantiate               | PM owns templates initially                                            |
| Team assignment                         | No                                  | OWNER                            | Query/command                         | V9 needs identity mapping before write authority                       |
| Team chat/threads/files                 | No                                  | OWNER/native replacement target  | Search/summarize/govern               | KOBTEAMLLM already has substantial Slack-like UI                       |
| Time tracking/daily closeout            | Personal focus telemetry            | OWNER team operations            | Analyze                               | Preserve PM implementation                                             |
| Approvals/governance                    | Confirm cards                       | Operational QA                   | OWNER policy/governance               | Standardize approval contracts in V9                                   |
| Disposable agents                       | No                                  | Agent-builder overlap            | OWNER                                 | V9 Agent Factory is canonical agent execution direction                |
| Business Graph/context                  | Personal context                    | Operational data                 | OWNER cross-system graph              | V9 links people, clients, work, objectives and evidence                |
| Notifications                           | Personal push                       | Team notifications               | Policy/event routing                  | Keep presentation local; centralize event intent later                 |
| Cross-system Daily Brief                | OWNER presentation                  | Data source                      | OWNER synthesis                       | Jeremy-OS presents Jeremy's brief; V9 assembles business context       |

## Important overlap findings

### Jeremy-OS

Jeremy-OS is not merely a wellness/focus app anymore. It already contains Donna chat and voice, Gmail/mail and inbox workflows, Google Calendar, Slack, Basecamp, Fathom, GHL, push notifications, daily planning, proposals/confirmations and persistent coach memory.

Its persistence model is intentionally personal/single-user. That makes it a good cockpit and a poor canonical company operations database.

### KOBTEAMLLM

KOBTEAMLLM is already much closer to the Basecamp/Slack replacement than DONNA V9. It contains project/team UI plus chat threads, attachments, mentions, reactions, search, notification settings, online status, typing indicators, voice messages, Slack sync, WebSocket chat, command center surfaces, time tracking and PM dashboards.

Do not rebuild these features in V9 merely to move them later.

### DONNA V9

V9 has the strongest foundation for shared intelligence: tenant-aware relational work data, event/outbox infrastructure, task state governance, approval policy, Gmail/GHL adapters, model adapters, workers, Agent Factory direction and Business Graph concepts.

It should become the nervous system, not another giant end-user dashboard competing with the other two.

## Integration topology

```text
                 Jeremy-OS
              personal cockpit
                    |
          signed API / events
                    |
                    v
                 DONNA V9
        intelligence + orchestration
       events + graph + agents + policy
                    ^
                    |
          signed API / events
                    |
              KOBTEAMLLM
           team/client operations
```

## Data rules

1. One authoritative owner per mutable domain.
2. Never synchronize by assuming IDs match between repositories.
3. Use an integration identity map for external/system IDs.
4. Events are at-least-once and consumers are idempotent.
5. Webhooks are the fast path; cursor-based reconciliation repairs missed delivery.
6. No browser receives service-to-service credentials.
7. No LLM call is required for deterministic synchronization, counts, state transitions, recurrence or notifications.
8. Sensitive personal Jeremy-OS data does not automatically enter the company Business Graph. Integration is allow-listed by domain.

## First integration sprint: Donna Nervous System

### Goal

Give DONNA V9 read-only awareness of KOBTEAMLLM operational changes without changing PM behavior or requiring an LLM.

### Slice 1: V9 integration foundation

Add:

- integration_sources
- integration_identity_map
- integration_inbox
- schema-versioned operational event types
- HMAC verification
- timestamp/replay protection
- idempotent event receipt tests
- organization/tenant validation

### Slice 2: KOBTEAMLLM event publisher

Publish a narrow first vocabulary:

- client.updated
- project.updated
- sprint.created
- sprint.updated
- task.created
- task.updated
- task.moved
- task.completed
- task.blocked
- assignment.changed

Every event includes a unique event ID, source ID, schema version, organization, occurred-at timestamp, entity type, external entity ID and correlation ID.

### Slice 3: read model

V9 consumes those events into an operational read model/Business Graph linkage. PM remains authoritative. V9 does not write back in Sprint 1.

### Slice 4: reconciliation

Add a changed-since cursor endpoint on PM and a V9 reconciliation job. Tests must prove duplicate delivery and a missed webhook do not corrupt state.

### Definition of done

- PM continues to work if V9 is unavailable.
- V9 accepts valid signed events and rejects invalid/replayed events.
- Duplicate events are harmless.
- Tenant boundaries are tested.
- A missed event is repaired by reconciliation.
- No LLM is called for synchronization.
- No PM write commands exist yet.
- Existing V9 CI, including live-Postgres integration, passes.

## Next integration after PM read-only sync

Expose a narrow V9 context endpoint to Jeremy-OS so its Donna can answer questions such as:

- What needs me today?
- What is blocked?
- What is Kianna waiting on from me?
- What changed on Premier?
- What approvals need my decision?

Jeremy-OS remains the presentation layer. V9 performs governed cross-system retrieval and synthesis. PM remains the source of operational truth.

## Subscription-retirement gates

### Basecamp

Retire only when KOBTEAMLLM has verified parity for the Basecamp features the team actually uses, data migration is complete, permissions are tested, backups exist and the team has operated successfully without Basecamp for an agreed validation period.

### Slack

Retire later. KOBTEAMLLM already has promising native communication primitives, but Slack retirement requires reliable real-time delivery, unread state, mentions, threads, attachments, search, notifications, mobile/PWA behavior, presence expectations and migration/history decisions.

The goal is not feature-for-feature cloning. The goal is parity for the team's real workflow.

## Anti-duplication rule

Before adding a material feature to any of the three repositories, check this ownership matrix. If another system owns the capability, integrate with it instead of creating a second authority.

The ecosystem wins when Donna knows where truth lives.
