import { describe, expect, it } from 'vitest';

import { rowToEnvelope, type EventRow } from './outbox-store.js';

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    type: 'task.created',
    organizationId: 'org1',
    objectiveId: null,
    taskId: null,
    actorType: 'orchestrator',
    actorId: 'orch',
    correlationId: 'corr1',
    causationId: null,
    payloadRef: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('rowToEnvelope', () => {
  it('maps core fields and builds the actor', () => {
    const e = rowToEnvelope(row());
    expect(e.id).toBe('e1');
    expect(e.type).toBe('task.created');
    expect(e.organizationId).toBe('org1');
    expect(e.actor).toEqual({ type: 'orchestrator', id: 'orch' });
    expect(e.correlationId).toBe('corr1');
    expect(e.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('omits optional fields that are null in the row', () => {
    const e = rowToEnvelope(row());
    expect('objectiveId' in e).toBe(false);
    expect('taskId' in e).toBe(false);
    expect('causationId' in e).toBe(false);
    expect('payloadRef' in e).toBe(false);
  });

  it('includes optional fields when present', () => {
    const e = rowToEnvelope(
      row({ objectiveId: 'obj1', taskId: 'task1', causationId: 'e0', payloadRef: 'ref://x' }),
    );
    expect(e.objectiveId).toBe('obj1');
    expect(e.taskId).toBe('task1');
    expect(e.causationId).toBe('e0');
    expect(e.payloadRef).toBe('ref://x');
  });
});
