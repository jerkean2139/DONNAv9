import { asc, inArray, isNull } from 'drizzle-orm';

import type {
  Actor,
  CorrelationId,
  EventEnvelope,
  EventId,
  EventType,
  ObjectiveId,
  OrganizationId,
  TaskId,
} from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import type { OutboxStore } from '@donna/events';

/** A row shape from the `events` table, as returned by Drizzle. */
export interface EventRow {
  id: string;
  type: string;
  organizationId: string;
  objectiveId: string | null;
  taskId: string | null;
  actorType: string;
  actorId: string;
  correlationId: string;
  causationId: string | null;
  payloadRef: string | null;
  createdAt: Date;
}

/**
 * Map a persisted event row to the domain `EventEnvelope`. Pure and
 * dependency-free so it can be unit-tested without a database. Optional fields
 * are omitted (never `undefined`) to match the envelope contract.
 */
export function rowToEnvelope(row: EventRow): EventEnvelope {
  const actor: Actor = { type: row.actorType as Actor['type'], id: row.actorId };
  return {
    id: row.id as EventId,
    type: row.type as EventType,
    organizationId: row.organizationId as OrganizationId,
    actor,
    correlationId: row.correlationId as CorrelationId,
    createdAt: row.createdAt,
    ...(row.objectiveId !== null ? { objectiveId: row.objectiveId as ObjectiveId } : {}),
    ...(row.taskId !== null ? { taskId: row.taskId as TaskId } : {}),
    ...(row.causationId !== null ? { causationId: row.causationId as EventId } : {}),
    ...(row.payloadRef !== null ? { payloadRef: row.payloadRef } : {}),
  };
}

/**
 * Postgres-backed {@link OutboxStore} (Technical Plan §5). Fetches undispatched
 * events oldest-first and marks them dispatched after successful delivery.
 * The `dispatched_at` marker was written null in the same transaction as the
 * state change that produced the event.
 */
export class DrizzleOutboxStore implements OutboxStore {
  constructor(private readonly db: DonnaDatabase) {}

  async fetchUnpublished(limit: number): Promise<EventEnvelope[]> {
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(isNull(schema.events.dispatchedAt))
      .orderBy(asc(schema.events.createdAt))
      .limit(limit);
    return rows.map((r) => rowToEnvelope(r as EventRow));
  }

  async markPublished(ids: readonly EventId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(schema.events)
      .set({ dispatchedAt: new Date() })
      .where(inArray(schema.events.id, [...ids]));
  }
}
