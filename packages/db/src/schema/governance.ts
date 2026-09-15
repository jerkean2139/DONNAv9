import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import {
  actorTypeEnum,
  approvalDecisionEnum,
  delegationStatusEnum,
  riskLevelEnum,
} from './enums.js';
import { objectives, tasks } from './execution.js';
import { organizations, users } from './tenancy.js';

/**
 * Approval — deterministic approval gate record (Technical Plan §6.3,
 * Build Bible doc 06). Stores exact scope; a material scope change invalidates
 * a prior approval. Model reasoning can never bypass an approval.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    proposedAction: text('proposed_action').notNull(),
    targetResources: jsonb('target_resources').notNull().default([]),
    exactScope: jsonb('exact_scope').notNull().default({}),
    riskLevel: riskLevelEnum('risk_level').notNull().default('high'),
    reason: text('reason'),
    previewDiffRef: text('preview_diff_ref'),
    decision: approvalDecisionEnum('decision').notNull().default('pending'),
    approverId: uuid('approver_id').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('approvals_org_idx').on(t.organizationId),
    index('approvals_decision_idx').on(t.organizationId, t.decision),
  ],
);

/**
 * Delegation — structured Donna-to-Donna work transfer (Technical Plan §13,
 * Build Bible V2-014). Never a conversational handoff alone.
 */
export const delegations = pgTable(
  'delegations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id').references(() => objectives.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    delegatorId: uuid('delegator_id')
      .notNull()
      .references(() => users.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    priority: text('priority').notNull().default('normal'),
    definitionOfDone: text('definition_of_done').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    // Authority boundary the delegate may act within (level 0-4).
    authorityBoundary: text('authority_boundary').notNull().default('1'),
    escalationRules: jsonb('escalation_rules'),
    status: delegationStatusEnum('status').notNull().default('proposed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('delegations_org_idx').on(t.organizationId)],
);

/**
 * Audit event — security/compliance audit of approval-sensitive actions
 * (Technical Plan §6.3, Build Bible doc 06). Distinct from the execution
 * event stream: records actor, policy decision, requested vs approved scope,
 * result and artifact/diff references.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetResource: text('target_resource'),
    requestedScope: jsonb('requested_scope'),
    approvedScope: jsonb('approved_scope'),
    result: text('result').notNull(),
    artifactRef: text('artifact_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_events_org_idx').on(t.organizationId),
    index('audit_events_actor_idx').on(t.organizationId, t.actorId),
  ],
);

/**
 * Feature flag — staged rollout without destructive schema changes
 * (Technical Plan §14, Build Bible V2-024). A null organizationId is a global
 * flag; otherwise it is org-scoped.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    rollout: jsonb('rollout'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('feature_flags_org_key_unique').on(t.organizationId, t.key)],
);

/**
 * Idempotency key — first-writer-wins record so a side-effecting action runs at
 * most once even across retries (Technical Plan §5, Build Bible V2-021).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    resultRef: text('result_ref'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('idempotency_keys_org_key_unique').on(t.organizationId, t.key)],
);
