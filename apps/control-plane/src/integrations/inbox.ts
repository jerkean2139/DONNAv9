import {
  isOperationalEntityType,
  isOperationalEventType,
  type OperationalEventEnvelope,
} from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import { and, eq } from 'drizzle-orm';

export interface IntegrationSourceConfig {
  readonly key: string;
  readonly secret: string;
}

export interface IntegrationInbox {
  resolveSource(
    sourceKey: string,
    externalOrganizationId: string,
  ): Promise<{
    readonly id: string;
    readonly organizationId: string;
  } | null>;
  receive(
    sourceId: string,
    organizationId: string,
    event: OperationalEventEnvelope,
  ): Promise<{ readonly duplicate: boolean }>;
}

export class DrizzleIntegrationInbox implements IntegrationInbox {
  public constructor(private readonly db: DonnaDatabase) {}

  async resolveSource(sourceKey: string, externalOrganizationId: string) {
    const [row] = await this.db
      .select({
        id: schema.integrationSources.id,
        organizationId: schema.integrationSources.organizationId,
      })
      .from(schema.integrationSources)
      .where(
        and(
          eq(schema.integrationSources.key, sourceKey),
          eq(schema.integrationSources.externalOrganizationId, externalOrganizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async receive(sourceId: string, organizationId: string, event: OperationalEventEnvelope) {
    const rows = await this.db
      .insert(schema.integrationInbox)
      .values({
        organizationId,
        sourceId,
        eventId: event.eventId,
        schemaVersion: event.schemaVersion,
        eventType: event.eventType,
        entityType: event.entityType,
        externalEntityId: event.externalEntityId,
        correlationId: event.correlationId,
        occurredAt: new Date(event.occurredAt),
        payload: event.payload,
      })
      .onConflictDoNothing({
        target: [
          schema.integrationInbox.organizationId,
          schema.integrationInbox.sourceId,
          schema.integrationInbox.eventId,
        ],
      })
      .returning({ id: schema.integrationInbox.id });
    return { duplicate: rows.length === 0 };
  }
}

export function parseOperationalEvent(value: unknown): OperationalEventEnvelope | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const eventId = body['event_id'];
  const schemaVersion = body['schema_version'];
  const eventType = body['event_type'];
  const organizationId = body['organization_id'];
  const occurredAt = body['occurred_at'];
  const entityType = body['entity_type'];
  const externalEntityId = body['external_entity_id'];
  const correlationId = body['correlation_id'];
  const payload = body['payload'];

  if (
    typeof eventId !== 'string' ||
    schemaVersion !== '1' ||
    typeof eventType !== 'string' ||
    !isOperationalEventType(eventType) ||
    typeof organizationId !== 'string' ||
    typeof occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(occurredAt)) ||
    typeof entityType !== 'string' ||
    !isOperationalEntityType(entityType) ||
    typeof externalEntityId !== 'string' ||
    typeof correlationId !== 'string' ||
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  return {
    eventId,
    schemaVersion,
    eventType,
    organizationId,
    occurredAt,
    entityType,
    externalEntityId,
    correlationId,
    payload: payload as Record<string, unknown>,
  };
}
