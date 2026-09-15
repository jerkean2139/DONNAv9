/**
 * Authority levels for the deterministic, server-enforced permission model
 * (Technical Plan §6, Build Bible doc 06). Prompts never grant authority.
 */
export const AUTHORITY_LEVELS = {
  /** 0 — read-only. */
  OBSERVE: 0,
  /** 1 — research / draft / analyze / propose changes. */
  PREPARE: 1,
  /** 2 — explicitly approved repeatable actions within bounded policy. */
  ROUTINE_ACTION: 2,
  /** 3 — money, contracts, pricing, prod deploys, client-facing comms, destructive/security changes. */
  APPROVAL_REQUIRED: 3,
  /** 4 — always requires direct human execution. */
  NEVER_AUTONOMOUS: 4,
} as const;

export type AuthorityLevelName = keyof typeof AUTHORITY_LEVELS;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[AuthorityLevelName];

/** True when an action at `level` may run without a per-action human approval. */
export function isAutonomouslyExecutable(level: AuthorityLevel): boolean {
  return level <= AUTHORITY_LEVELS.ROUTINE_ACTION;
}

/** True when an action at `level` requires an explicit approval gate. */
export function requiresApproval(level: AuthorityLevel): boolean {
  return level >= AUTHORITY_LEVELS.APPROVAL_REQUIRED;
}
