import type { OrganizationId, TaskId } from '@donna/core-domain';
import { createEvent } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { envelopeToInsert } from './outbox-bus.js';

describe('envelopeToInsert', () => {
  it('maps an envelope to an events insert with dispatchedAt null', () => {
    const event = createEvent({
      type: 'task.completed',
      organizationId: 'org1' as OrganizationId,
      actor: { type: 'orchestrator', id: 'orchestrator' },
      taskId: 'task1' as TaskId,
      now: new Date('2026-02-02T00:00:00Z'),
    });

    const row = envelopeToInsert(event);

    expect(row.id).toBe(event.id);
    expect(row.type).toBe('task.completed');
    expect(row.organizationId).toBe('org1');
    expect(row.taskId).toBe('task1');
    expect(row.actorType).toBe('orchestrator');
    expect(row.actorId).toBe('orchestrator');
    expect(row.correlationId).toBe(event.correlationId);
    expect(row.createdAt).toEqual(new Date('2026-02-02T00:00:00Z'));
    // Left null so the OutboxDispatcher picks it up (transactional outbox).
    expect(row.dispatchedAt).toBeNull();
  });

  it('nulls optional fields absent from the envelope', () => {
    const event = createEvent({
      type: 'task.planned',
      organizationId: 'org1' as OrganizationId,
      actor: { type: 'orchestrator', id: 'orchestrator' },
    });

    const row = envelopeToInsert(event);

    expect(row.taskId).toBeNull();
    expect(row.objectiveId).toBeNull();
    expect(row.causationId).toBeNull();
    expect(row.payloadRef).toBeNull();
  });
});
