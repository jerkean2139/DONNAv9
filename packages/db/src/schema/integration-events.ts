import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './tenancy.js';

/**
 * Registered internal systems that may exchange governed events with Donna.
 * Secrets are never stored here; service credentials live in Railway secrets.
 */
export const integrationSources = pgTable(
  'integration_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('integration_sources_org_key_unique').on(t.organizationId, t.key),
    unique('integration_sources_org_id_unique').on(t.organizationId, t.id),
  ],
);

/**
 * Maps a source system's stable identifier to Donna's canonical identifier.
 * This prevents accidental assumptions that IDs from two systems are equal.
 */
export const integrationIdentityMap = pgTable(
  'integration_identity_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => integrationSources.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    externalId: text('external_id').notNull(),
    donnaId: uuid('donna_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('integration_identity_source_external_unique').on(
      t.organizationId,
      t.sourceId,
      t.entityType,
      t.externalId,
    ),
    index('integration_identity_donna_idx').on(t.organizationId, t.entityType, t.donnaId),
    foreignKey({
      columns: [t.organizationId, t.sourceId],
      foreignColumns: [integrationSources.organizationId, integrationSources.id],
      name: 'integration_identity_org_source_fk',
    }),
  ],
);

/**
 * Durable inbox for at-least-once integration delivery. event_id is unique per
 * source and organization, so retries are acknowledged without being processed
 * twice. The payload is operational metadata only; secrets must never be sent.
 */
export const integrationInbox = pgTable(
  'integration_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => integrationSources.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    schemaVersion: text('schema_version').notNull(),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    externalEntityId: text('external_entity_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [
    unique('integration_inbox_source_event_unique').on(t.organizationId, t.sourceId, t.eventId),
    index('integration_inbox_pending_idx').on(t.organizationId, t.processedAt),
    index('integration_inbox_entity_idx').on(t.organizationId, t.entityType, t.externalEntityId),
    foreignKey({
      columns: [t.organizationId, t.sourceId],
      foreignColumns: [integrationSources.organizationId, integrationSources.id],
      name: 'integration_inbox_org_source_fk',
    }),
  ],
);
