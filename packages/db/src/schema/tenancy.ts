import { relations } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { roleEnum, scopeEnum } from './enums.js';

/**
 * Tenancy & identity (Technical Plan §3.1, Build Bible V2-025).
 *
 * `organization` is the primary isolation boundary. Every business-state row
 * carries `organizationId`; server-side policy (Phase 1 `packages/policy`)
 * enforces access, with Postgres RLS added later as defense-in-depth.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  // Stable id from the external identity provider's organization (e.g. Clerk
  // org id). Nullable; unique when present so a webhook maps to one org.
  externalAuthId: text('external_auth_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    // Stable subject id from the external identity provider (e.g. Clerk `sub`).
    // Nullable — seeded/service users may have none; unique when present so a
    // verified token maps to exactly one user (Technical Plan §6/§8).
    externalAuthId: text('external_auth_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('users_org_email_unique').on(t.organizationId, t.email),
    unique('users_external_auth_id_unique').on(t.externalAuthId),
    index('users_org_idx').on(t.organizationId),
    // Composite tenancy key (SEC-3b): the target for `(organization_id, id)`
    // foreign keys that co-locate a referencing row with its user's tenant.
    unique('users_org_id_unique').on(t.organizationId, t.id),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('teams_org_idx').on(t.organizationId),
    // Composite tenancy key (SEC-3b): FK target for `(organization_id, team_id)`.
    unique('teams_org_id_unique').on(t.organizationId, t.id),
  ],
);

/**
 * Membership links a user to the organization (and optionally a team) with a
 * role. Roles are supplemented by resource/action permissions in Phase 1's
 * policy engine — a role alone is never the authorization decision.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    role: roleEnum('role').notNull().default('team_member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('memberships_user_team_unique').on(t.userId, t.teamId),
    index('memberships_org_idx').on(t.organizationId),
    index('memberships_user_idx').on(t.userId),
    // Cross-tenant integrity (SEC-3b): the member's user and team must belong to
    // the membership's own organization. `no action` on delete so the existing
    // single-column FKs keep owning the cascade / set-null behavior; these only
    // reject an insert/update that points across the tenant boundary. The
    // team_id pair is skipped when team_id is null (MATCH SIMPLE).
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
      name: 'memberships_org_user_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
      name: 'memberships_org_team_fk',
    }),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    scope: scopeEnum('scope').notNull().default('ORGANIZATION'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('projects_org_idx').on(t.organizationId),
    // Composite tenancy key (SEC-3b): FK target for `(organization_id, project_id)`.
    unique('projects_org_id_unique').on(t.organizationId, t.id),
  ],
);

/**
 * Project membership links a user to a project they may access. Distinct from
 * team/org membership: the policy engine consumes it as `principal.projectIds`
 * to authorize PROJECT-scoped resources (Technical Plan §6). Unique per
 * (project, user) so a user joins a project at most once.
 */
export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('project_memberships_project_user_unique').on(t.projectId, t.userId),
    index('project_memberships_org_idx').on(t.organizationId),
    index('project_memberships_user_idx').on(t.userId),
    // Cross-tenant integrity (SEC-3b): the project and user must belong to the
    // membership's own organization (see memberships above for the rationale).
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: 'project_memberships_org_project_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
      name: 'project_memberships_org_user_fk',
    }),
  ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  teams: many(teams),
  memberships: many(memberships),
  projects: many(projects),
  projectMemberships: many(projectMemberships),
}));

export const projectMembershipsRelations = relations(projectMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [projectMemberships.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [projectMemberships.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMemberships.userId], references: [users.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  team: one(teams, { fields: [memberships.teamId], references: [teams.id] }),
}));
