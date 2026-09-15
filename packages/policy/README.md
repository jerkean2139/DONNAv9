# @donna/policy

Deterministic, server-enforced permission and approval engine (Technical Plan
§6, Build Bible V2-009). Pure functions over typed, trusted input — prompts and
external/model content never reach these decisions and can never grant authority
(Build Bible V2-023).

## Decision model

`evaluate(input)` returns `{ effect, reason, message }` where `effect` is
`allow | deny | requires_approval`. Checks run deny-first, in order:

1. **Tenant isolation** — different organization → `deny (cross_tenant)`.
2. **Scope access** — `ORGANIZATION` / `TEAM` / `PROJECT` / `PRIVATE`. Private
   context is owner-only; admin/executive status does not bypass it.
3. **Kill switches** — a paused side-effecting action → `deny (kill_switch)`;
   reads/research remain available (Technical Plan §6.4).
4. **Role authority ceiling** — action above the role's ceiling →
   `deny (insufficient_authority)`.
5. **Never autonomous** (level 4) — allowed only for a human actor.
6. **Approval required** (level 3) → `requires_approval`.
7. Otherwise (observe/prepare/routine) → `allow`.

Authority levels come from `@donna/core-domain`
(`OBSERVE 0 … NEVER_AUTONOMOUS 4`).

## Approval helpers

`approvalStillValid()` / `isScopeChangeMaterial()` / `scopesEqual()` enforce
that a prior approval only authorizes the _exact_ approved scope: any material
scope change (or expiry, or a non-approved decision) invalidates it and forces
re-approval.

## Role ceilings are defaults

`DEFAULT_ROLE_CEILINGS` are sensible defaults. The exact KOB mapping — and which
concrete actions are level 3 vs level 4 — is an open question pending Jeremy's
confirmation (Technical Plan §22, item 9). Override per call via
`PolicyInput.roleCeilings`.

## Boundaries

Pure logic: depends only on `@donna/core-domain`, no database, no provider SDKs,
no I/O. The control-plane API and worker call `evaluate()` with data they have
already loaded and authenticated; this package never reads the session, the DB,
or the network itself.
