import type { Actor, OrganizationId } from '@donna/core-domain';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus } from './bus.js';
import { createEvent } from './create-event.js';

const org = 'org1' as OrganizationId;
const actor: Actor = { type: 'orchestrator', id: 'orch' };

describe('InMemoryEventBus', () => {
  it('delivers to type-specific and wildcard subscribers', async () => {
    const bus = new InMemoryEventBus();
    const onTaskCreated = vi.fn();
    const onAny = vi.fn();
    bus.subscribe('task.created', onTaskCreated);
    bus.subscribe('*', onAny);

    await bus.publish(createEvent({ type: 'task.created', organizationId: org, actor }));
    await bus.publish(createEvent({ type: 'task.completed', organizationId: org, actor }));

    expect(onTaskCreated).toHaveBeenCalledTimes(1);
    expect(onAny).toHaveBeenCalledTimes(2);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const off = bus.subscribe('task.created', handler);
    off();
    await bus.publish(createEvent({ type: 'task.created', organizationId: org, actor }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler and reports it', async () => {
    const onError = vi.fn();
    const bus = new InMemoryEventBus(onError);
    const good = vi.fn();
    bus.subscribe('*', () => {
      throw new Error('boom');
    });
    bus.subscribe('*', good);

    await bus.publish(createEvent({ type: 'system.alert', organizationId: org, actor }));

    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
