import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './tenancy.js';

export const constitutionStatusEnum = pgEnum('constitution_status', [
  'proposed',
  'approved',
  'superseded',
  'rejected',
]);

export const constitutionRuleKindEnum = pgEnum('constitution_rule_kind', [
  'goal_priority',
  'definition_of_done',
  'role_authority',
  'customer_promise',
  'communication_brand',
  'financial_threshold',
  'operational_threshold',
  'escalation',
  'ai_boundary',
  'risk_tolerance',
  'never_autonomous',
]);

export const businessConstitutions = pgTable(
  'business_constitutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: constitutionStatusEnum('status').notNull().default('proposed'),
    title: text('title').notNull().default('Business Constitution'),
    proposedByUserId: uuid('proposed_by_user_id'),
    approvedByUserId: uuid('approved_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('business_constitutions_org_id_unique').on(t.organizationId, t.id),
    unique('business_constitutions_org_version_unique').on(t.organizationId, t.version),
    index('business_constitutions_active_idx').on(t.organizationId, t.status, t.version),
    foreignKey({
      columns: [t.organizationId, t.proposedByUserId],
      foreignColumns: [users.organizationId, users.id],
      name: 'business_constitutions_org_proposer_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.approvedByUserId],
      foreignColumns: [users.organizationId, users.id],
      name: 'business_constitutions_org_approver_fk',
    }),
  ],
);

export const constitutionRules = pgTable(
  'constitution_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    constitutionId: uuid('constitution_id').notNull(),
    kind: constitutionRuleKindEnum('kind').notNull(),
    key: text('key').notNull(),
    statement: text('statement').notNull(),
    // Deterministic enforcement fields live beside human-readable guidance.
    action: text('action'),
    thresholdMinor: integer('threshold_minor'),
    currency: text('currency'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    neverAutonomous: boolean('never_autonomous').notNull().default(false),
    structuredValue: jsonb('structured_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('constitution_rules_org_id_unique').on(t.organizationId, t.id),
    index('constitution_rules_lookup_idx').on(t.organizationId, t.constitutionId, t.kind),
    foreignKey({
      columns: [t.organizationId, t.constitutionId],
      foreignColumns: [businessConstitutions.organizationId, businessConstitutions.id],
      name: 'constitution_rules_org_constitution_fk',
    }).onDelete('cascade'),
  ],
);
