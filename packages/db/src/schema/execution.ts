import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  actorTypeEnum,
  eventTypeEnum,
  executionClassEnum,
  objectiveStatusEnum,
  riskLevelEnum,
  scopeEnum,
  taskStatusEnum,
} from './enums.js';
import { organizations, projects, users } from './tenancy.js';

/**
 * Objective — the durable unit Donna owns (Technical Plan §3.3, Build Bible
 * doc 04). Represents a requested outcome with an explicit definition of done.
 */
export const objectives = pgTable(
  'objectives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scope: scopeEnum('scope').notNull().default('ORGANIZATION'),
    // scope_ref points at the owning project/team/user for non-org scopes.
    scopeRef: uuid('scope_ref'),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    requestedOutcome: text('requested_outcome').notNull(),
    definitionOfDone: text('definition_of_done').notNull(),
    status: objectiveStatusEnum('status').notNull().default('draft'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    priority: integer('priority').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completionSummary: text('completion_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('objectives_org_idx').on(t.organizationId),
    index('objectives_status_idx').on(t.organizationId, t.status),
    // Composite tenancy key (SEC-3b): FK target for `(organization_id, id)`
    // references from tasks and events.
    unique('objectives_org_id_unique').on(t.organizationId, t.id),
    // Cross-tenant integrity (SEC-3b): requester, owner, and project must belong
    // to the objective's own organization. `no action` on delete leaves the
    // existing single-column FKs owning any cascade / set-null behavior; these
    // only reject an insert/update that crosses the tenant boundary. The
    // project_id pair is skipped when project_id is null (MATCH SIMPLE).
    foreignKey({
      columns: [t.organizationId, t.requesterId],
      foreignColumns: [users.organizationId, users.id],
      name: 'objectives_org_requester_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [users.organizationId, users.id],
      name: 'objectives_org_owner_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'objectives_org_project_fk',
    }),
  ],
);

/**
 * Task — the durable execution unit (Technical Plan §3.3/§5). Tasks are rows
 * with a full lifecycle, lease/heartbeat columns for safe reclamation, a
 * checkpoint for resumable long jobs, and an idempotency key so retries never
 * duplicate side effects (Build Bible V2-021).
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id')
      .notNull()
      .references(() => objectives.id, { onDelete: 'cascade' }),
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, {
      onDelete: 'set null',
    }),
    goal: text('goal').notNull(),
    definitionOfDone: text('definition_of_done').notNull(),
    status: taskStatusEnum('status').notNull().default('pending'),
    // Set by the Work Router (above the Model Router).
    executionClass: executionClassEnum('execution_class'),
    requiredCapabilities: text('required_capabilities').array().notNull().default([]),
    // Authority level 0-4 (Technical Plan §6.2). Deterministically enforced.
    requiredAuthority: integer('required_authority').notNull().default(0),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    approvalPolicy: jsonb('approval_policy'),
    // Protects side-effecting execution from duplication on retry.
    idempotencyKey: text('idempotency_key'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    // Durable job control.
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    checkpoint: jsonb('checkpoint'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('tasks_org_idx').on(t.organizationId),
    index('tasks_objective_idx').on(t.objectiveId),
    index('tasks_status_idx').on(t.organizationId, t.status),
    // Idempotency keys are unique per organization when present.
    index('tasks_idempotency_idx').on(t.organizationId, t.idempotencyKey),
    // Composite tenancy key (SEC-3b): FK target for `(organization_id, id)`
    // references from task_dependencies, events, and this table's parent link.
    unique('tasks_org_id_unique').on(t.organizationId, t.id),
    // Cross-tenant integrity (SEC-3b): a task's objective and parent task must
    // belong to the task's own organization. `no action` on delete leaves the
    // existing single-column FKs owning cascade / set-null; the parent_task_id
    // pair is skipped when null (MATCH SIMPLE).
    foreignKey({
      columns: [t.organizationId, t.objectiveId],
      foreignColumns: [objectives.organizationId, objectives.id],
      name: 'tasks_org_objective_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.parentTaskId],
      foreignColumns: [t.organizationId, t.id],
      name: 'tasks_org_parent_fk',
    }),
  ],
);

/** Task dependency edges form the task graph (Technical Plan §3.2). */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }),
    index('task_deps_org_idx').on(t.organizationId),
    // Cross-tenant integrity (SEC-3b): both edges of a dependency must belong to
    // the dependency row's own organization (see tasks above for the rationale).
    foreignKey({
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: 'task_deps_org_task_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.dependsOnTaskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: 'task_deps_org_depends_fk',
    }),
  ],
);

/**
 * Event — append-only execution history (Technical Plan §4.2, Build Bible
 * doc 02). The substrate for UI projections, audit, recovery/replay and
 * observability. Sensitive/large payloads are referenced, never inlined.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id').references(() => objectives.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    type: eventTypeEnum('type').notNull(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    causationId: uuid('causation_id'),
    payloadRef: text('payload_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Transactional-outbox marker: null until the dispatcher delivers this
    // event to the bus (Technical Plan §4.2/§5). Written in the same
    // transaction as the state change that produced the event.
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  },
  (t) => [
    index('events_org_idx').on(t.organizationId),
    index('events_objective_idx').on(t.objectiveId),
    index('events_task_idx').on(t.taskId),
    index('events_correlation_idx').on(t.correlationId),
    // Supports the outbox fetch: undispatched events, oldest first.
    index('events_undispatched_idx').on(t.dispatchedAt, t.createdAt),
    // Cross-tenant integrity (SEC-3b): an event's objective and task must belong
    // to the event's own organization. Both pairs are skipped when the ref is
    // null (MATCH SIMPLE); `no action` leaves the single-column set-null FKs to
    // own the delete behavior.
    foreignKey({
      columns: [t.organizationId, t.objectiveId],
      foreignColumns: [objectives.organizationId, objectives.id],
      name: 'events_org_objective_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: 'events_org_task_fk',
    }),
  ],
);

export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [objectives.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [objectives.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  organization: one(organizations, {
    fields: [tasks.organizationId],
    references: [organizations.id],
  }),
  objective: one(objectives, { fields: [tasks.objectiveId], references: [objectives.id] }),
}));
