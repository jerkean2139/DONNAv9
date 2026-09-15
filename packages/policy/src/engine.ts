import { AUTHORITY_LEVELS } from '@donna/core-domain';

import { DEFAULT_ROLE_CEILINGS } from './roles.js';
import { isBlockedByKillSwitch, NO_KILL_SWITCHES } from './kill-switches.js';
import type {
  PolicyDecision,
  PolicyInput,
  PolicyReason,
  PrincipalContext,
  ResourceDescriptor,
} from './types.js';

function decide(
  effect: PolicyDecision['effect'],
  reason: PolicyReason,
  message: string,
): PolicyDecision {
  return { effect, reason, message };
}

/**
 * Whether the principal may access a resource given its scope. Enforced
 * server-side; UI hiding is not authorization (Build Bible doc 06). Private
 * context is owner-only — executive/admin status does not silently expose it.
 */
function hasScopeAccess(principal: PrincipalContext, resource: ResourceDescriptor): boolean {
  switch (resource.scope) {
    case 'ORGANIZATION':
      // Same-organization membership is already established by the tenant check.
      return true;
    case 'TEAM':
      return resource.teamId !== undefined && principal.teamIds.includes(resource.teamId);
    case 'PROJECT':
      return resource.projectId !== undefined && principal.projectIds.includes(resource.projectId);
    case 'PRIVATE':
      return resource.ownerUserId !== undefined && resource.ownerUserId === principal.userId;
    default:
      return false;
  }
}

/**
 * The deterministic policy decision (Technical Plan §6, Build Bible V2-009).
 *
 * Pure function, evaluated in strict order (deny-first). Prompts and model
 * reasoning never reach this decision — it operates only on typed, trusted
 * input. An approval gate (`requires_approval`) and the never-autonomous rule
 * cannot be bypassed.
 */
export function evaluate(input: PolicyInput): PolicyDecision {
  const { principal, action, resource } = input;
  const killSwitches = input.killSwitches ?? NO_KILL_SWITCHES;
  const roleCeilings = input.roleCeilings ?? DEFAULT_ROLE_CEILINGS;

  // 1. Tenant isolation — the primary boundary (Build Bible V2-025).
  if (resource.organizationId !== principal.organizationId) {
    return decide('deny', 'cross_tenant', 'Resource belongs to a different organization.');
  }

  // 2. Scope access.
  if (!hasScopeAccess(principal, resource)) {
    return decide('deny', 'scope_denied', `Principal lacks access to ${resource.scope} resource.`);
  }

  // 3. Kill switches (side-effecting actions only).
  if (isBlockedByKillSwitch(action, killSwitches)) {
    return decide('deny', 'kill_switch', `Action "${action.name}" is paused by a kill switch.`);
  }

  // 4. Role authority ceiling.
  const ceiling = roleCeilings[principal.role];
  if (action.authorityLevel > ceiling) {
    return decide(
      'deny',
      'insufficient_authority',
      `Role "${principal.role}" may not attempt an action at authority level ${action.authorityLevel}.`,
    );
  }

  // 5. Never autonomous — human execution only.
  if (action.authorityLevel === AUTHORITY_LEVELS.NEVER_AUTONOMOUS) {
    if (principal.actorKind === 'human') {
      return decide(
        'allow',
        'ok',
        'Permitted: direct human execution of a never-autonomous action.',
      );
    }
    return decide(
      'deny',
      'never_autonomous',
      'This action always requires direct human execution.',
    );
  }

  // 6. Approval required — deterministic gate.
  if (action.authorityLevel === AUTHORITY_LEVELS.APPROVAL_REQUIRED) {
    return decide(
      'requires_approval',
      'approval_required',
      'This action requires explicit approval.',
    );
  }

  // 7. Observe / prepare / routine action.
  return decide('allow', 'ok', 'Permitted.');
}
