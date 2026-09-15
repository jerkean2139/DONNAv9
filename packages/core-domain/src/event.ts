import type { CorrelationId, EventId, ObjectiveId, OrganizationId, TaskId } from './ids.js';

/**
 * Canonical event types (Technical Plan §4.2, Build Bible doc 02). The event
 * stream is append-only and is the substrate for UI projections, the audit
 * trail, recovery/replay and observability.
 */
export const EVENT_TYPES = [
  'objective.created',
  'task.created',
  'task.planned',
  'task.assigned',
  'worker.started',
  'tool.called',
  'artifact.created',
  'approval.requested',
  'approval.decided',
  'task.blocked',
  'task.retried',
  'task.completed',
  'task.failed',
  'memory.updated',
  'node.health_changed',
  'system.alert',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type ActorType = 'human' | 'orchestrator' | 'adapter' | 'checker';

export interface Actor {
  readonly type: ActorType;
  readonly id: string;
}

/**
 * The envelope carried by every event. Sensitive or large payloads are
 * referenced (`payloadRef`), not inlined, so secrets never leak into the log
 * (Technical Plan §4.2/§8).
 */
export interface EventEnvelope {
  readonly id: EventId;
  readonly type: EventType;
  readonly organizationId: OrganizationId;
  readonly objectiveId?: ObjectiveId;
  readonly taskId?: TaskId;
  readonly actor: Actor;
  readonly correlationId: CorrelationId;
  readonly causationId?: EventId;
  /** Opaque reference to a payload stored outside the event body. */
  readonly payloadRef?: string;
  readonly createdAt: Date;
}

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
