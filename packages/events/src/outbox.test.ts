import type { Actor, EventEnvelope, OrganizationId } from '@donna/core-domain';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus, type EventBus } from './bus.js';
import { createEvent } from './create-event.js';
import { InMemoryOutboxStore, OutboxDispatcher } from './outbox.js';

const org = 'org1' as OrganizationId;
const actor: Actor = { type: 'orchestrator', id: 'orch' };

function anEvent(): EventEnvelope {
  return createEvent({ type: 'task.created', organizationId: org, actor });
}

describe('OutboxDispatcher', () => {
  it('publishes enqueued events to the bus and marks them published', async () => {
    const store = new InMemoryOutboxStore();
    const bus = new InMemoryEventBus();
    const seen = vi.fn();
    bus.subscribe('*', seen);
    store.enqueue(anEvent());
    store.enqueue(anEvent());

    const count = await new OutboxDispatcher(store, bus).dispatchBatch();

    expect(count).toBe(2);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(store.unpublishedCount()).toBe(0);
  });

  it('does not re-publish already-published events', async () => {
    const store = new InMemoryOutboxStore();
    const bus = new InMemoryEventBus();
    store.enqueue(anEvent());
    const dispatcher = new OutboxDispatcher(store, bus);

    expect(await dispatcher.dispatchBatch()).toBe(1);
    expect(await dispatcher.dispatchBatch()).toBe(0);
  });

  it('leaves an event unpublished if delivery fails (at-least-once)', async () => {
    const store = new InMemoryOutboxStore();
    store.enqueue(anEvent());
    const failing: EventBus = {
      publish: () => Promise.reject(new Error('bus down')),
      subscribe: () => () => {},
    };

    await expect(new OutboxDispatcher(store, failing).dispatchBatch()).rejects.toThrow('bus down');
    expect(store.unpublishedCount()).toBe(1);
  });
});
