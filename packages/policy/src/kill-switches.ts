import type { ActionDescriptor, KillSwitchState } from './types.js';

/** No kill switches engaged — the default state. */
export const NO_KILL_SWITCHES: KillSwitchState = {
  globalPause: false,
  disabledCapabilities: [],
};

/**
 * Whether a kill switch blocks this action (Technical Plan §6.4).
 *
 * Only side-effecting actions are blocked; read/research remains available so
 * Donna degrades rather than going dark. A global pause blocks all side effects;
 * otherwise the action's capability category must be disabled.
 */
export function isBlockedByKillSwitch(action: ActionDescriptor, state: KillSwitchState): boolean {
  if (!action.sideEffecting) return false;
  if (state.globalPause) return true;
  return action.capability !== undefined && state.disabledCapabilities.includes(action.capability);
}
