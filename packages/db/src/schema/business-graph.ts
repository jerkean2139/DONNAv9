import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { sourceConfidenceEnum } from './enums.js';
import { organizations } from './tenancy.js';

/**
 * Business Graph — organization-scoped relationship intelligence.
 *
 * These rows describe business concepts and their relationships without making
 * the graph itself authoritative for permissions. Policy and relational source
 * tables remain authoritative. Every edge is forced to connect nodes from the
 * same organization at the database layer.
 */
export const businessEntities = pgTable(
  'business_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Provider-neutral semantic type: person, client, vendor, product, project,
    // system, location, process, etc. Validation belongs in the graph service.
    entityType: text('entity_type').notNull(),
    name: text('name').notNull(),
    // Optional pointer to an authoritative relational/external record. It is a
    // reference for provenance/resolution, never an authorization bypass.
    sourceSystem: text('source_system'),
    sourceRef: text('source_ref'),
    confidence: sourceConfidenceEnum('confidence').notNull().default('UNVERIFIED'),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('business_entities_org_id_unique').on(t.organizationId, t.id),
    index('business_entities_org_type_idx').on(t.organizationId, t.entityType),
    index('business_entities_source_idx').on(t.organizationId, t.sourceSystem, t.sourceRef),
  ],
);

export const businessRelationships = pgTable(
  'business_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fromEntityId: uuid('from_entity_id')
      .notNull()
      .references(() => businessEntities.id, { onDelete: 'cascade' }),
    toEntityId: uuid('to_entity_id')
      .notNull()
      .references(() => businessEntities.id, { onDelete: 'cascade' }),
    // Extensible predicate such as owns, manages, works_for, uses, belongs_to.
    relationshipType: text('relationship_type').notNull(),
    sourceSystem: text('source_system'),
    sourceRef: text('source_ref'),
    confidence: sourceConfidenceEnum('confidence').notNull().default('UNVERIFIED'),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('business_relationships_org_id_unique').on(t.organizationId, t.id),
    index('business_relationships_from_idx').on(t.organizationId, t.fromEntityId),
    index('business_relationships_to_idx').on(t.organizationId, t.toEntityId),
    index('business_relationships_type_idx').on(t.organizationId, t.relationshipType),
    foreignKey({
      columns: [t.organizationId, t.fromEntityId],
      foreignColumns: [businessEntities.organizationId, businessEntities.id],
      name: 'business_relationships_org_from_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.toEntityId],
      foreignColumns: [businessEntities.organizationId, businessEntities.id],
      name: 'business_relationships_org_to_fk',
    }),
  ],
);
