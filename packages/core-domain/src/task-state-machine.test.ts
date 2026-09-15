import { describe, expect, it } from 'vitest';

import { AUTHORITY_LEVELS } from './authority.js';
import type { ObjectiveId, TaskId } from './ids.js';
import type { Task, TaskStatus } from './task.js';
import { TASK_STATUSES } from './task.js';
import {
  allowedTransitions,
  canTransition,
  IllegalTaskTransitionError,
  isDone,
  transition,
} from './task-state-machine.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1' as TaskId,
    objectiveId: 'o1' as ObjectiveId,
    goal: 'do a thing',
    definitionOfDone: 'the thing is done',
    status: 'pending',
    requiredAuthority: AUTHORITY_LEVELS.PREPARE,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

describe('task state machine', () => {
  it('permits a normal happy-path lifecycle', () => {
    const path: TaskStatus[] = ['planned', 'assigned', 'running', 'checking', 'completed'];
    let task = makeTask();
    for (const next of path) {
      task = transition(task, next);
      expect(task.status).toBe(next);
    }
    expect(isDone(task)).toBe(true);
  });

  it('rejects an illegal transition without mutating the input', () => {
    const task = makeTask({ status: 'pending' });
    expect(() => transition(task, 'completed')).toThrow(IllegalTaskTransitionError);
    expect(task.status).toBe('pending');
  });

  it('treats completed and cancelled as terminal', () => {
    expect(allowedTransitions('completed')).toEqual([]);
    expect(allowedTransitions('cancelled')).toEqual([]);
    expect(isDone(makeTask({ status: 'completed' }))).toBe(true);
    expect(isDone(makeTask({ status: 'cancelled' }))).toBe(true);
  });

  it('counts retries and refuses to retry past maxRetries', () => {
    // First retry: failed -> pending increments the counter.
    const firstRetry = transition(
      makeTask({ status: 'failed', retryCount: 0, maxRetries: 2 }),
      'pending',
    );
    expect(firstRetry.retryCount).toBe(1);

    // Second (last allowed) retry.
    const secondRetry = transition(
      makeTask({ status: 'failed', retryCount: 1, maxRetries: 2 }),
      'pending',
    );
    expect(secondRetry.retryCount).toBe(2);

    // Budget exhausted: no further retry.
    const exhausted = makeTask({ status: 'failed', retryCount: 2, maxRetries: 2 });
    expect(() => transition(exhausted, 'pending')).toThrow(IllegalTaskTransitionError);
  });

  it('does not increment retryCount on non-retry transitions', () => {
    const task = transition(makeTask({ status: 'running' }), 'completed');
    expect(task.retryCount).toBe(0);
  });

  it('every non-terminal status has at least one outgoing transition', () => {
    for (const status of TASK_STATUSES) {
      const outgoing = allowedTransitions(status);
      if (status === 'completed' || status === 'cancelled') {
        expect(outgoing).toHaveLength(0);
      } else {
        expect(outgoing.length).toBeGreaterThan(0);
      }
    }
  });

  it('canTransition agrees with allowedTransitions', () => {
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(canTransition(from, to)).toBe(allowedTransitions(from).includes(to));
      }
    }
  });
});
