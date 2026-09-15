import type { EventEnvelope } from '@donna/core-domain';

import * as schema from './schema/index.js';

/** Insert shape for the `events` table. */
export type EventInsert = typeof schema.events.$inferInsert;

/**
 * Map a domain {@link EventEnvelope} to an `events` insert row, leaving
 * `dispatchedAt` null so the outbox dispatcher picks it up. This is the write
 * half of the transactional outbox (Technical Plan §4.2/§5): every service that
 * records a state change inserts the event through this mapper in the SAME
 * transaction. Pure — the inferred type is compile-time only — so it is
 * unit-testable without a database.
 */
export function eventEnvelopeToRow(event: EventEnvelope): EventInsert {
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
