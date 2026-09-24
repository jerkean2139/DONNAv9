import { createEvent } from '@donna/events';
import type { OrganizationId } from '@donna/core-domain';
import type { WorkOrderStatus } from '@donna/orchestrator';
import { describe, expect, it } from 'vitest';

import { BufferingEventBus, targetStatusForResult } from './task-state.js';

describe('targetStatusForResult', () => {
  it('maps every orchestrator outcome to its durable task status', () => {
    const cases: Record<WorkOrderStatus, ReturnType<typeof targetStatusForResult>> = {
      completed: 'completed',
      failed: 'failed',
      approval_required: 'awaiting_approval',
      denied: 'blocked',
      blocked: 'blocked',
      budget_exceeded: 'blocked',
      awaiting_human: 'blocked',
    };
    for (const [status, expected] of Object.entries(cases)) {
      expect(targetStatusForResult(status as WorkOrderStatus)).toBe(expected);
    }
  });
});

describe('BufferingEventBus', () => {
  const event = () =>
    createEvent({
      type: 'task.completed',
      organizationId: 'org1' as OrganizationId,
      actor: { type: 'orchestrator', id: 'o' },
    });

  it('collects published events and drains them once', async () => {
    const bus = new BufferingEventBus();
    await bus.publish(event());
    await bus.publish(event());
    const drained = bus.drain();
    expect(drained).toHaveLength(2);
    // A second drain is empty — the buffer is emptied on drain.
    expect(bus.drain()).toHaveLength(0);
  });

  it('is write-only: subscribing throws', () => {
    const bus = new BufferingEventBus();
    expect(() => bus.subscribe()).toThrow(/write-only/);
  });
});
