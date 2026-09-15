import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
  (t) => [index('teams_org_idx').on(t.organizationId)],
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
  (t) => [index('projects_org_idx').on(t.organizationId)],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  teams: many(teams),
  memberships: many(memberships),
  projects: many(projects),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  team: one(teams, { fields: [memberships.teamId], references: [teams.id] }),
}));
