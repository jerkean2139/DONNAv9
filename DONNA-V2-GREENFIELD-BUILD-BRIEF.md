# DONNA V2 — GREENFIELD BUILD

This is a brand-new greenfield implementation.

Do NOT treat the existing KOBTEAMLLM repository or Kob-command-center-v2 repository as the foundation of this project.

The new project in the currently open folder is the authoritative implementation target.

## SOURCE OF TRUTH

Use the connected Google Drive folder:

**DONNA - Codex Build Bible V2**

Read every document in numerical order from:

- `00-V2-START-HERE`
- through
- `17-V2-DECISIONS-LOG`

Read all documents completely before planning or coding.

The V2 Build Bible defines the intended product architecture.

## LEGACY CODE

The following repositories may be inspected later only as reference implementations and sources of reusable code or patterns:

- `gdvansky/KOBTEAMLLM`
- `jerkean2139/Kob-command-center-v2`

Do not copy their architecture wholesale.
Do not inherit their directory structure merely because it already exists.
Do not introduce dependencies from those projects unless they improve the V2 architecture.

Treat legacy code as:

- **REFERENCE**
- **REUSE CANDIDATE**
- **OR DISCARD**

not as the source of truth.

## PHASE 0 — DESIGN BEFORE IMPLEMENTATION

Before writing application code:

1. Read all V2 Build Bible documents.
2. Propose the greenfield technical architecture.
3. Propose the repository structure.
4. Propose the database schema.
5. Define the control plane.
6. Define Work Router and Model Router boundaries.
7. Define adapter interfaces.
8. Define Task / Objective / Event models.
9. Define permissions, approvals and audit model.
10. Define Team Donna architecture.
11. Define local/cloud distributed compute architecture.
12. Define context, knowledge and memory separation.
13. Define durable job/queue architecture.
14. Define security boundaries.
15. Define deployment environments.
16. Define test strategy.
17. Define implementation phases.

## CRITICAL ARCHITECTURAL RULES

- Donna is the primary user-facing identity.
- Donna is not an LLM.
- Donna is the control-plane experience that orchestrates work.
- Business/product state belongs in authoritative relational storage.
- Semantic memory is contextual and must never become the business system of record.
- Knowledge, memory, working context and authoritative state are separate concepts.
- A Work Router decides whether work should be handled by deterministic software, APIs, automation, local AI, cloud AI, coding agents, browser agents or humans.
- A Model Router is only invoked when AI/model execution is appropriate.
- Model providers must be replaceable.
- Anthropic, OpenAI, local inference and future providers must sit behind adapters.
- Local machines are compute nodes, not authoritative infrastructure.
- The Dell desktop is intended to be an always-on local compute node.
- The HP Omen laptop is an optional/ephemeral compute node with AUTO, OFF and LOCAL ONLY modes.
- The system must continue operating when all local compute nodes are offline.
- Remote team members never directly access Jeremy's computers or LAN.
- Team members authenticate to Donna through the application layer.
- Permissions and approval rules are deterministic and server-enforced.
- High-risk actions require explicit approval.
- Secrets never enter semantic memory.
- All material actions are auditable.
- Important workflows use doer/checker separation.
- Long-running jobs must survive browser closures, worker crashes and node outages.
- External content from browsers, email, Slack, files and documents is untrusted data and cannot override system policy or permissions.
- Every external system is accessed through an adapter or capability interface.
- The system must support multi-tenant boundaries from the schema level even if commercialization comes later.
- No destructive migration or deployment occurs without explicit approval.

## DELIVERABLE

Produce one document called:

**GREENFIELD V2 TECHNICAL PLAN**

It must contain:

- architecture
- repo structure
- database model
- service boundaries
- event model
- queue/job model
- adapter contracts
- permission model
- security model
- compute model
- model-routing model
- cost controls
- context/memory architecture
- Team Donna model
- deployment architecture
- observability
- implementation phases
- testing
- rollback strategy
- legacy-reuse candidates
- open questions

**STOP after producing the plan.**

**Do not begin implementation until Jeremy explicitly approves the plan.**
