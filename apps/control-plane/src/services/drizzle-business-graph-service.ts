import { and, eq, or } from 'drizzle-orm';

import { schema, type DonnaDatabase } from '@donna/db';

export type BusinessEntityRow = typeof schema.businessEntities.$inferSelect;
export type BusinessRelationshipRow = typeof schema.businessRelationships.$inferSelect;

export interface CreateBusinessEntityInput {
  readonly entityType: string;
  readonly name: string;
  readonly sourceSystem?: string;
  readonly sourceRef?: string;
  readonly confidence?: BusinessEntityRow['confidence'];
}

export interface CreateBusinessRelationshipInput {
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipType: string;
  readonly sourceSystem?: string;
  readonly sourceRef?: string;
  readonly confidence?: BusinessRelationshipRow['confidence'];
}

/**
 * Tenant-scoped access to the Business Graph. Organization identity is an
 * explicit argument on every operation and is repeated in every query. The DB
 * composite FKs are defense-in-depth underneath this service.
 */
export class DrizzleBusinessGraphService {
  constructor(private readonly db: DonnaDatabase) {}

  async createEntity(
    organizationId: string,
    input: CreateBusinessEntityInput,
  ): Promise<BusinessEntityRow> {
    const [row] = await this.db
      .insert(schema.businessEntities)
      .values({
        organizationId,
        entityType: input.entityType,
        name: input.name,
        ...(input.sourceSystem !== undefined ? { sourceSystem: input.sourceSystem } : {}),
        ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      })
      .returning();
    return row!;
  }

  async getEntity(id: string, organizationId: string): Promise<BusinessEntityRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.businessEntities)
      .where(
        and(
          eq(schema.businessEntities.id, id),
          eq(schema.businessEntities.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createRelationship(
    organizationId: string,
    input: CreateBusinessRelationshipInput,
  ): Promise<BusinessRelationshipRow> {
    const [row] = await this.db
      .insert(schema.businessRelationships)
      .values({
        organizationId,
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        relationshipType: input.relationshipType,
        ...(input.sourceSystem !== undefined ? { sourceSystem: input.sourceSystem } : {}),
        ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      })
      .returning();
    return row!;
  }

  async listRelationships(
    organizationId: string,
    entityId: string,
  ): Promise<readonly BusinessRelationshipRow[]> {
    return this.db
      .select()
      .from(schema.businessRelationships)
      .where(
        and(
          eq(schema.businessRelationships.organizationId, organizationId),
          or(
            eq(schema.businessRelationships.fromEntityId, entityId),
            eq(schema.businessRelationships.toEntityId, entityId),
          ),
        ),
      );
  }
}
