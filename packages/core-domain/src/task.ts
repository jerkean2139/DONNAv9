import type { AuthorityLevel } from './authority.js';
import type { IdempotencyKey, ObjectiveId, TaskId } from './ids.js';

/**
 * Execution classes chosen by the Work Router (Technical Plan §1.2/§4,
 * Build Bible V2-006). The Work Router sits ABOVE the Model Router: AI classes
 * (`local_ai`/`cloud_ai`) are selected only after work routing decides AI is
 * the right execution path.
 */
export const EXECUTION_CLASSES = [
  'deterministic',
  'automation',
  'human',
  'browser',
  'coding_agent',
  'local_ai',
  'cloud_ai',
] as const;

export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];

export function isAiExecutionClass(cls: ExecutionClass): boolean {
  return cls === 'local_ai' || cls === 'cloud_ai';
}

/**
 * Durable Task lifecycle (Technical Plan §3.3/§5). Tasks are rows with a full
 * state machine, not ephemeral queue messages, so they survive browser closes,
 * worker crashes and node outages (Build Bible V2-008/V2-021).
 */
export const TASK_STATUSES = [
  'pending',
  'planned',
  'assigned',
  'running',
  'blocked',
  'awaiting_approval',
  'checking',
  'completed',
  'failed',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Terminal states that never transition again. */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'cancelled'];

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}

/**
 * Minimal durable Task shape. This is the core-domain view; the persisted row
 * (Technical Plan §3.3) carries additional operational columns (leases,
 * heartbeats, checkpoints, budgets, artifacts).
 */
export interface Task {
  readonly id: TaskId;
  readonly objectiveId: ObjectiveId;
  readonly parentTaskId?: TaskId;
  readonly goal: string;
  readonly definitionOfDone: string;
  readonly status: TaskStatus;
  readonly executionClass?: ExecutionClass;
  readonly requiredAuthority: AuthorityLevel;
  /** Present for side-effecting tasks so retries never duplicate effects. */
  readonly idempotencyKey?: IdempotencyKey;
  readonly retryCount: number;
  readonly maxRetries: number;
}
