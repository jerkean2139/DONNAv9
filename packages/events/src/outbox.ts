import type { EventEnvelope, EventId } from '@donna/core-domain';

import type { EventBus } from './bus.js';

/**
 * Transactional outbox (Technical Plan §4.2/§5).
 *
 * The write path persists an event in the SAME database transaction as the
 * state change that produced it — so no state change is ever recorded without
 * its event, and no phantom event is emitted. A separate dispatcher then
 * delivers persisted events to the {@link EventBus} and marks them published.
 *
 * Delivery is at-least-once; downstream side effects dedupe via idempotency
 * keys (Build Bible V2-021). The production store is Drizzle/Postgres-backed
 * (added with the worker); this interface keeps the dispatcher testable.
 */
export interface OutboxStore {
  /** Events not yet delivered to the bus, oldest first. */
  fetchUnpublished(limit: number): Promise<EventEnvelope[]>;
  /** Mark the given events delivered so they are not published again. */
  markPublished(ids: readonly EventId[]): Promise<void>;
}

/**
 * Pulls unpublished events and delivers them to the bus. An event is marked
 * published only after it is successfully delivered, so a delivery failure
 * leaves it to be retried on the next batch (at-least-once).
 */
export class OutboxDispatcher {
  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
  ) {}

  /** Deliver up to `limit` pending events. Returns how many were published. */
  async dispatchBatch(limit = 100): Promise<number> {
    const pending = await this.store.fetchUnpublished(limit);
    const delivered: EventId[] = [];
    for (const event of pending) {
      await this.bus.publish(event);
      delivered.push(event.id);
    }
    if (delivered.length > 0) {
      await this.store.markPublished(delivered);
    }
    return delivered.length;
  }
}

/**
 * In-memory outbox store for local dev and tests. `enqueue` stands in for the
 * transactional insert the real store performs alongside a state change.
 */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly pending: EventEnvelope[] = [];
  private readonly published = new Set<EventId>();

  enqueue(event: EventEnvelope): void {
    this.pending.push(event);
  }

  fetchUnpublished(limit: number): Promise<EventEnvelope[]> {
    const batch = this.pending.filter((e) => !this.published.has(e.id)).slice(0, limit);
    return Promise.resolve(batch);
  }

  markPublished(ids: readonly EventId[]): Promise<void> {
    for (const id of ids) this.published.add(id);
    return Promise.resolve();
  }

  /** Test helper: count of events not yet marked published. */
  unpublishedCount(): number {
    return this.pending.filter((e) => !this.published.has(e.id)).length;
  }
}
