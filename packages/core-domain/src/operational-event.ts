export const OPERATIONAL_EVENT_TYPES = [
  'client.updated',
  'project.updated',
  'sprint.created',
  'sprint.updated',
  'task.created',
  'task.updated',
  'task.moved',
  'task.completed',
  'task.blocked',
  'assignment.changed',
] as const;

export type OperationalEventType = (typeof OPERATIONAL_EVENT_TYPES)[number];

export const OPERATIONAL_ENTITY_TYPES = [\n  'client',\n  'project',\n  'sprint',\n  'task',\n  'assignment',\n] as const;

export type OperationalEntityType = (typeof OPERATIONAL_ENTITY_TYPES)[number];

export interface OperationalEventEnvelope {
  readonly eventId: string;
  readonly schemaVersion: '1';
  readonly eventType: OperationalEventType;
  readonly organizationId: string;
  readonly occurredAt: string;
  readonly entityType: OperationalEntityType;
  readonly externalEntityId: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function isOperationalEventType(value: string): value is OperationalEventType {
  return (OPERATIONAL_EVENT_TYPES as readonly string[]).includes(value);
}

export function isOperationalEntityType(value: string): value is OperationalEntityType {
  return (OPERATIONAL_ENTITY_TYPES as readonly string[]).includes(value);
}
