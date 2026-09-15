import type { EventEnvelope } from '@donna/core-domain';
import { eventEnvelopeToRow, schema, type DonnaDatabase } from '@donna/db';
import type { EventBus, Unsubscribe } from '@donna/events';

/**
 * Map a domain {@link EventEnvelope} to an `events` insert row. Re-exported from
 * `@donna/db` — the schema-owning package holds the one canonical mapping (the
 * write half of the transactional outbox), shared with the control-plane's
 * Drizzle services. Kept under this name for the outbox bus and its tests.
 */
export const envelopeToInsert = eventEnvelopeToRow;

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
