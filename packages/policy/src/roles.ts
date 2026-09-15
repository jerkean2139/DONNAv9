import { AUTHORITY_LEVELS, type AuthorityLevel, type Role } from '@donna/core-domain';

/**
 * Default role → authority ceiling: the highest authority level an action may
 * carry for a principal of this role to be permitted to attempt it.
 *
 * These are sensible DEFAULTS. The exact KOB-specific mapping — and which
 * concrete actions sit at level 3 (approval) vs level 4 (never autonomous) — is
 * an open question pending Jeremy's confirmation (Technical Plan §22, item 9).
 * Callers may override via `PolicyInput.roleCeilings`.
 *
 * Note: clearing the ceiling only means the action may be *attempted*. Level-3
 * actions still return `requires_approval`, and level-4 actions still require a
 * human actor — the ceiling never bypasses those gates.
 */
export const DEFAULT_ROLE_CEILINGS: Readonly<Record<Role, AuthorityLevel>> = {
  owner: AUTHORITY_LEVELS.NEVER_AUTONOMOUS,
  admin: AUTHORITY_LEVELS.NEVER_AUTONOMOUS,
  executive: AUTHORITY_LEVELS.APPROVAL_REQUIRED,
  team_lead: AUTHORITY_LEVELS.APPROVAL_REQUIRED,
  team_member: AUTHORITY_LEVELS.ROUTINE_ACTION,
  contractor: AUTHORITY_LEVELS.PREPARE,
};
