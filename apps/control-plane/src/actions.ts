import { AUTHORITY_LEVELS } from '@donna/core-domain';
import type { ActionDescriptor } from '@donna/policy';

/**
 * Action catalog for the control-plane API. Each action declares the authority
 * level the policy engine enforces (Technical Plan §6). The precise level for
 * each concrete action is subject to Jeremy's role/authority confirmation
 * (§22 item 9); creating a draft objective is a Prepare-level action.
 */
export const OBJECTIVE_CREATE_ACTION: ActionDescriptor = {
  name: 'objective.create',
  authorityLevel: AUTHORITY_LEVELS.PREPARE,
  sideEffecting: false,
};
