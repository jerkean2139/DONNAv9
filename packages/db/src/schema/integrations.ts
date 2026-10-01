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

import { emailModeEnum, emailStatusEnum } from './enums.js';
import { organizations, users } from './tenancy.js';
import { workItems } from './work.js';

/**
 * A person's Google account connection (Gmail, compose scope only). One per
 * user per organization. The refresh token is stored encrypted by the
 * control-plane (AES-256-GCM, key from the environment) — never in plaintext,
 * never returned by the API.
 */
export const googleConnections = pgTable(
  'google_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    scopes: jsonb('scopes').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('google_connections_org_user_unique').on(t.organizationId, t.userId),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
      name: 'google_connections_org_user_fk',
    }),
  ],
);

/**
 * Every email Donna saved to Gmail drafts or sent for a task — the audit
 * record of exactly what went out, from whom, approved by whom. The row is
 * written as `pending` before Gmail is called so an interrupted send is never
 * silently repeated.
 */
export const outboundEmails = pgTable(
  'outbound_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    // The person who approved it; it goes out from their connected account.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromEmail: text('from_email').notNull(),
    to: jsonb('to').notNull(),
    cc: jsonb('cc').notNull().default([]),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    mode: emailModeEnum('mode').notNull(),
    status: emailStatusEnum('status').notNull().default('pending'),
    gmailMessageId: text('gmail_message_id'),
    gmailDraftId: text('gmail_draft_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('outbound_emails_work_item_idx').on(t.organizationId, t.workItemId),
    foreignKey({
      columns: [t.organizationId, t.workItemId],
      foreignColumns: [workItems.organizationId, workItems.id],
      name: 'outbound_emails_org_work_item_fk',
    }),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
      name: 'outbound_emails_org_user_fk',
    }),
  ],
);
