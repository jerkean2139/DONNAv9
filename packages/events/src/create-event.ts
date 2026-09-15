import { randomUUID } from 'node:crypto';

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

export interface CreateEventInput {
  readonly type: EventType;
  readonly organizationId: OrganizationId;
  readonly actor: Actor;
  readonly objectiveId?: ObjectiveId;
  readonly taskId?: TaskId;
  /** Reuse an existing correlation id to tie related events together. */
  readonly correlationId?: CorrelationId;
  /** The event that caused this one, for causal tracing. */
  readonly causationId?: EventId;
  /** Reference to an out-of-band payload; never inline secrets (§4.2/§8). */
  readonly payloadRef?: string;
  /** Injectable clock for deterministic tests. */
  readonly now?: Date;
}

/**
 * Build a well-formed {@link EventEnvelope}. Generates the event id and, when
 * not supplied, a fresh correlation id. Optional fields are omitted (never set
 * to `undefined`) so the envelope stays clean under exactOptionalPropertyTypes.
 */
export function createEvent(input: CreateEventInput): EventEnvelope {
  return {
    id: randomUUID() as EventId,
    type: input.type,
    organizationId: input.organizationId,
    actor: input.actor,
    correlationId: input.correlationId ?? (randomUUID() as CorrelationId),
    createdAt: input.now ?? new Date(),
    ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    ...(input.payloadRef !== undefined ? { payloadRef: input.payloadRef } : {}),
  };
}
