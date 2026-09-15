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

/**
 * Dispatching a task creates the durable task and enqueues a work order for the
 * orchestrator to route. Dispatch itself is Prepare-level and non-side-effecting
 * — it schedules planning/execution, it does not perform the outward action. The
 * task carries its own required authority, and the orchestrator's deterministic
 * policy gate re-enforces it before any side-effecting step runs.
 */
export const TASK_DISPATCH_ACTION: ActionDescriptor = {
  name: 'task.dispatch',
  authorityLevel: AUTHORITY_LEVELS.PREPARE,
  sideEffecting: false,
};
