# ADR-0001 — Adopt the Greenfield V2 Technical Plan

- **Date:** 2026-09-15
- **Status:** Accepted
- **Approver:** Jeremy (jeremy@keanonbiz.com)

## Decision

The `GREENFIELD-V2-TECHNICAL-PLAN.md` in this repository is the approved
Phase-0 design for the DONNA V2 greenfield build. Implementation proceeds
phase by phase per its §18, beginning with Phase 0 (foundation scaffolding).

## Reason

The plan was produced from a complete reading of the V2 Build Bible (docs
00–18) and honors every V2 invariant. Jeremy approved it explicitly and
directed that implementation start at Phase 0 using the plan's recommended
technology defaults.

## Alternatives considered

- Treating the legacy KOBTEAMLLM / Kob-command-center-v2 repositories as the
  foundation — rejected per Build Bible doc 18 (greenfield build rules);
  legacy code is reference/reuse-candidate/discard only.

## Consequences

- Work begins in the DONNA v9 repository as the authoritative target.
- Each subsequent phase carries its own acceptance criteria and approval gate.
- No destructive migration, infrastructure change, or authentication/
  authorization change occurs without a further explicit approval
  (Build Bible doc 16 STOP conditions).

## Affected docs

- `GREENFIELD-V2-TECHNICAL-PLAN.md`
- Build Bible V2 Decisions Log (doc 17) — should note plan adoption.
