import type { Objective, ObjectiveId, Task, TaskId, UserId } from '@donna/core-domain';
import { AUTHORITY_LEVELS } from '@donna/core-domain';
import { schema } from '@donna/db';
import { describe, expect, it } from 'vitest';

import { buildWorkOrder, objectiveToRow, rowToObjective, rowToTask, taskToRow } from './mappers.js';

const objective: Objective = {
  id: 'obj1' as ObjectiveId,
  scope: 'ORGANIZATION',
  requesterId: 'u1' as UserId,
  ownerId: 'u1' as UserId,
  requestedOutcome: 'Ship Route 40',
  definitionOfDone: 'Launched',
  status: 'draft',
  riskLevel: 'low',
};

const task: Task = {
  id: 'task1' as TaskId,
  objectiveId: 'obj1' as ObjectiveId,
  goal: 'Summarize',
  definitionOfDone: 'A summary',
  status: 'pending',
  requiredAuthority: AUTHORITY_LEVELS.PREPARE,
  retryCount: 0,
  maxRetries: 3,
};

describe('objective mappers', () => {
  it('adds the tenancy org id on the way to a row', () => {
    const row = objectiveToRow(objective, 'org1');
    expect(row.organizationId).toBe('org1');
    expect(row.requestedOutcome).toBe('Ship Route 40');
    expect(row.status).toBe('draft');
    expect('projectId' in row).toBe(false);
  });

  it('round-trips a row back to the domain object', () => {
    const row = { ...objectiveToRow(objective, 'org1') } as typeof schema.objectives.$inferSelect;
    // Columns the insert leaves to DB defaults, filled as the select would.
    const selected: typeof schema.objectives.$inferSelect = {
      ...row,
      scopeRef: null,
      projectId: null,
      priority: 0,
      dueAt: null,
      completionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const back = rowToObjective(selected);
    expect(back).toMatchObject({
      id: 'obj1',
      ownerId: 'u1',
      requestedOutcome: 'Ship Route 40',
      status: 'draft',
    });
    expect('projectId' in back).toBe(false);
  });
});

describe('task mappers', () => {
  it('stores required capabilities and the tenancy org id on the row', () => {
    const row = taskToRow(task, 'org1', ['reasoning', 'crm']);
    expect(row.organizationId).toBe('org1');
    expect(row.objectiveId).toBe('obj1');
    expect(row.requiredCapabilities).toEqual(['reasoning', 'crm']);
    expect(row.requiredAuthority).toBe(AUTHORITY_LEVELS.PREPARE);
  });

  it('round-trips a row back to the domain task, omitting null optionals', () => {
    const selected: typeof schema.tasks.$inferSelect = {
      ...taskToRow(task, 'org1', ['reasoning']),
      parentTaskId: null,
      executionClass: null,
      approvalPolicy: null,
      idempotencyKey: null,
      requiredAuthority: AUTHORITY_LEVELS.PREPARE,
      riskLevel: 'low',
      retryCount: 0,
      maxRetries: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      checkpoint: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const back = rowToTask(selected);
    expect(back).toMatchObject({ id: 'task1', objectiveId: 'obj1', goal: 'Summarize' });
    expect('executionClass' in back).toBe(false);
    expect('parentTaskId' in back).toBe(false);
  });
});

describe('buildWorkOrder', () => {
  it('ties the order to the task and carries routing hints', () => {
    const order = buildWorkOrder(task, 'org1', {
      requiredCapabilities: ['reasoning'],
      needsReasoning: true,
      reasoningTier: 5,
      modelRequest: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(order.organizationId).toBe('org1');
    expect(order.taskId).toBe('task1');
    expect(order.requiredCapabilities).toEqual(['reasoning']);
    expect(order.needsReasoning).toBe(true);
    expect(order.reasoningTier).toBe(5);
    expect(order.modelRequest?.messages[0]?.content).toBe('hi');
  });

  it('omits hints that are absent', () => {
    const order = buildWorkOrder(task, 'org1', { requiredCapabilities: [] });
    expect('needsReasoning' in order).toBe(false);
    expect('modelRequest' in order).toBe(false);
  });
});
