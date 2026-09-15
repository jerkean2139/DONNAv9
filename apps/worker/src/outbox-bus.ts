import type { EventEnvelope } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import type { EventBus, Unsubscribe } from '@donna/events';

/** Insert shape for a persisted outbox event (dispatched_at left null). */
type EventInsert = typeof schema.events.$inferInsert;

/**
 * Map a domain {@link EventEnvelope} to an `events` insert row, leaving
 * `dispatchedAt` null so the dispatcher picks it up. Pure and dependency-light
 * (the inferred type is compile-time only) so it can be unit-tested without a
 * database. Mirrors {@link rowToEnvelope} in the opposite direction.
 */
export function envelopeToInsert(event: EventEnvelope): EventInsert {
  return {
    id: event.id,
    type: event.type,
    organizationId: event.organizationId,
    objectiveId: event.objectiveId ?? null,
    taskId: event.taskId ?? null,
    actorType: event.actor.type,
    actorId: event.actor.id,
    correlationId: event.correlationId,
    causationId: event.causationId ?? null,
    payloadRef: event.payloadRef ?? null,
    createdAt: event.createdAt,
    dispatchedAt: null,
  };
}

/**
 * Write-only {@link EventBus} that persists every published event into the
 * `events` table with `dispatched_at = null` — the write half of the
 * transactional outbox (Technical Plan §4.2/§5). The orchestrator publishes
 * here, so an event is durably recorded in the same database as the state
 * change that produced it; the separate {@link OutboxDispatcher} (the
 * `dispatch-outbox` cron) then delivers persisted events to the live bus and
 * marks them dispatched.
 *
 * Subscribing to the outbox is not meaningful — consumers subscribe to the
 * delivered bus — so {@link DrizzleOutboxBus.subscribe} throws.
 */
export class DrizzleOutboxBus implements EventBus {
  constructor(private readonly db: DonnaDatabase) {}

  async publish(event: EventEnvelope): Promise<void> {
    await this.db.insert(schema.events).values(envelopeToInsert(event));
  }

  // The outbox is write-only: consumers subscribe to the delivered bus fed by
  // the OutboxDispatcher, not here. (Fewer params than EventBus.subscribe still
  // satisfies the interface.)
  subscribe(): Unsubscribe {
    throw new Error(
      'DrizzleOutboxBus is write-only; subscribe to the delivered bus fed by the OutboxDispatcher instead.',
    );
  }
}
