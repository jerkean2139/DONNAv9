import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { attachmentKindEnum, sprintStatusEnum, workItemStatusEnum } from './enums.js';
import { clients, organizations, projects, users } from './tenancy.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * The client work hierarchy (Client → Project → Sprint → Task → Subtask).
 *
 * `clients` and `projects` live in tenancy.ts (projects anchor project
 * membership and PROJECT scope; a project optionally belongs to a client).
 * Every child row
 * carries `organization_id` and references its parent through a composite
 * `(organization_id, id)` foreign key, so the hierarchy can never cross a
 * tenant boundary (SEC-3b), even if a service bug passed the wrong id.
 */
export const sprints = pgTable(
  'sprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: sprintStatusEnum('status').notNull().default('planned'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sprints_project_idx').on(t.organizationId, t.projectId),
    unique('sprints_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'sprints_org_project_fk',
    }),
  ],
);

/**
 * A task or, when `parent_id` is set, a subtask of one (one level deep — the
 * service enforces that a subtask's parent is itself top-level). Named
 * `work_items` so it never collides with the orchestrator's `tasks`.
 */
export const workItems = pgTable(
  'work_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Null = backlog. Deleting a sprint returns its tasks to the backlog.
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id'),
    title: text('title').notNull(),
    status: workItemStatusEnum('status').notNull().default('todo'),
    dueOn: date('due_on'),
    position: integer('position').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('work_items_project_idx').on(t.organizationId, t.projectId),
    index('work_items_sprint_idx').on(t.organizationId, t.sprintId),
    index('work_items_parent_idx').on(t.organizationId, t.parentId),
    unique('work_items_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'work_items_org_project_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.sprintId],
      foreignColumns: [sprints.organizationId, sprints.id],
      name: 'work_items_org_sprint_fk',
    }),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: 'work_items_parent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.parentId],
      foreignColumns: [t.organizationId, t.id],
      name: 'work_items_org_parent_fk',
    }),
  ],
);

/**
 * A file or link attached to exactly one level of the hierarchy. One nullable
 * FK per level (with a CHECK that exactly one is set) instead of a polymorphic
 * id, so deleting a client/project/sprint/task cascades to its attachments and
 * the database rejects a dangling or cross-tenant target.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id').references(() => workItems.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull(),
    title: text('title').notNull(),
    // Links: the target URL. Files: null (content lives in attachment_files).
    url: text('url'),
    // Links: detected provider (google_drive, figma, …). Files: null.
    provider: text('provider'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('attachments_client_idx').on(t.organizationId, t.clientId),
    index('attachments_project_idx').on(t.organizationId, t.projectId),
    index('attachments_sprint_idx').on(t.organizationId, t.sprintId),
    index('attachments_work_item_idx').on(t.organizationId, t.workItemId),
    unique('attachments_org_id_unique').on(t.organizationId, t.id),
    check(
      'attachments_one_target',
      sql`num_nonnulls(${t.clientId}, ${t.projectId}, ${t.sprintId}, ${t.workItemId}) = 1`,
    ),
    check(
      'attachments_kind_shape',
      sql`(${t.kind} = 'link' AND ${t.url} IS NOT NULL) OR (${t.kind} = 'file' AND ${t.url} IS NULL)`,
    ),
    foreignKey({
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
      name: 'attachments_org_client_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'attachments_org_project_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.sprintId],
      foreignColumns: [sprints.organizationId, sprints.id],
      name: 'attachments_org_sprint_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.workItemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: 'attachments_org_work_item_fk',
    }),
  ],
);

/**
 * Uploaded file bytes, kept apart from `attachments` so listing attachments
 * never reads file content. Stored in Postgres (capped by the API) so uploads
 * work with no object-storage setup; swap for S3/R2 later behind the service.
 */
export const attachmentFiles = pgTable(
  'attachment_files',
  {
    attachmentId: uuid('attachment_id')
      .primaryKey()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    content: bytea('content').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.attachmentId],
      foreignColumns: [attachments.organizationId, attachments.id],
      name: 'attachment_files_org_attachment_fk',
    }),
  ],
);
