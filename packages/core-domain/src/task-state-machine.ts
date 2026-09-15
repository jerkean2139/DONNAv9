import type { Task, TaskStatus } from './task.js';
import { isTerminalTaskStatus } from './task.js';

/**
 * Allowed Task status transitions (Technical Plan §3.3/§5).
 *
 * This is the durable job lifecycle. The orchestrator — not an LLM — owns
 * these transitions (Build Bible: "Donna is not an LLM"). Keeping the machine
 * pure and here makes it unit-testable and reusable by both the API and the
 * worker runtime.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['planned', 'cancelled'],
  planned: ['assigned', 'blocked', 'cancelled'],
  assigned: ['running', 'blocked', 'cancelled'],
  running: ['checking', 'awaiting_approval', 'blocked', 'completed', 'failed', 'cancelled'],
  blocked: ['assigned', 'running', 'failed', 'cancelled'],
  // approval decided: approved -> running; rejected -> failed/cancelled
  awaiting_approval: ['running', 'failed', 'cancelled'],
  // checker: pass -> completed; needs correction -> running; hard fail -> failed
  checking: ['completed', 'running', 'failed'],
  completed: [],
  // failed is retryable: a bounded retry re-enters the queue as pending
  failed: ['pending', 'cancelled'],
  cancelled: [],
};

export class IllegalTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Illegal task transition: ${from} -> ${to}`);
    this.name = 'IllegalTaskTransitionError';
  }
}

/** The statuses reachable from `from` in a single step. */
export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/** Whether a single-step transition `from -> to` is permitted. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Apply a status transition, returning a new Task (inputs are never mutated).
 *
 * A `failed -> pending` retry increments `retryCount` and is refused once
 * `maxRetries` is exhausted, so a deterministic failure cannot loop forever
 * (Technical Plan §5, Build Bible doc 04 failure flow).
 */
export function transition(task: Task, to: TaskStatus): Task {
  if (!canTransition(task.status, to)) {
    throw new IllegalTaskTransitionError(task.status, to);
  }

  const isRetry = task.status === 'failed' && to === 'pending';
  if (isRetry && task.retryCount >= task.maxRetries) {
    throw new IllegalTaskTransitionError(task.status, to);
  }

  return {
    ...task,
    status: to,
    retryCount: isRetry ? task.retryCount + 1 : task.retryCount,
  };
}

/** Whether the task has reached a state that will never transition again. */
export function isDone(task: Task): boolean {
  return isTerminalTaskStatus(task.status);
}
