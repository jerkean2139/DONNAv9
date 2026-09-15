import type { Actor, CorrelationId, OrganizationId } from '@donna/core-domain';
import { describe, expect, it } from 'vitest';

import { createEvent } from './create-event.js';

const org = 'org1' as OrganizationId;
const actor: Actor = { type: 'orchestrator', id: 'orch' };

describe('createEvent', () => {
  it('generates a unique id per event', () => {
    const a = createEvent({ type: 'task.created', organizationId: org, actor });
    const b = createEvent({ type: 'task.created', organizationId: org, actor });
    expect(a.id).not.toEqual(b.id);
  });

  it('generates a fresh correlation id when none is given', () => {
    const e = createEvent({ type: 'objective.created', organizationId: org, actor });
    expect(e.correlationId).toBeTruthy();
  });

  it('preserves a supplied correlation id', () => {
    const corr = 'corr-123' as CorrelationId;
    const e = createEvent({
      type: 'task.completed',
      organizationId: org,
      actor,
      correlationId: corr,
    });
    expect(e.correlationId).toBe(corr);
  });

  it('uses the injected clock', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const e = createEvent({ type: 'system.alert', organizationId: org, actor, now });
    expect(e.createdAt).toBe(now);
  });

  it('omits optional fields rather than setting undefined', () => {
    const e = createEvent({ type: 'task.created', organizationId: org, actor });
    expect('objectiveId' in e).toBe(false);
    expect('taskId' in e).toBe(false);
    expect('causationId' in e).toBe(false);
    expect('payloadRef' in e).toBe(false);
  });
});
