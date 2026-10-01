import { randomUUID } from 'node:crypto';

import type { EmailMode, EmailStatus } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import { and, desc, eq, gt } from 'drizzle-orm';

/** A stored Google connection. `refreshTokenEnc` is sealed by the SecretBox. */
export interface GoogleConnection {
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly refreshTokenEnc: string;
  readonly scopes: readonly string[];
}

export interface ConnectionStore {
  get(org: string, userId: string): Promise<GoogleConnection | null>;
  /** Insert or replace the user's connection. */
  save(connection: GoogleConnection): Promise<void>;
  remove(org: string, userId: string): Promise<GoogleConnection | null>;
}

/** What the API returns about an email — never a token. */
export interface OutboundEmailView {
  readonly id: string;
  readonly workItemId: string;
  readonly fromEmail: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly mode: EmailMode;
  readonly status: EmailStatus;
  readonly error: string | null;
  readonly gmailDraftId: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface NewOutboundEmail {
  readonly organizationId: string;
  readonly workItemId: string;
  readonly userId: string;
  readonly fromEmail: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly mode: EmailMode;
}

export type EmailOutcome =
  | { readonly status: 'done'; readonly messageId: string; readonly draftId?: string }
  | { readonly status: 'failed'; readonly error: string };

export interface EmailStore {
  /** Records the attempt as `pending` before Gmail is called. */
  begin(email: NewOutboundEmail): Promise<OutboundEmailView>;
  finish(org: string, id: string, outcome: EmailOutcome): Promise<OutboundEmailView | null>;
  listForTask(org: string, workItemId: string): Promise<OutboundEmailView[]>;
  /** Whether a send for the task is still pending since `since`. */
  hasPending(org: string, workItemId: string, since: Date): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory (development without a database, and tests)
// ---------------------------------------------------------------------------

export class InMemoryConnectionStore implements ConnectionStore {
  private readonly rows = new Map<string, GoogleConnection>();

  async get(org: string, userId: string) {
    return this.rows.get(`${org}:${userId}`) ?? null;
  }

  async save(connection: GoogleConnection) {
    this.rows.set(`${connection.organizationId}:${connection.userId}`, connection);
  }

  async remove(org: string, userId: string) {
    const existing = this.rows.get(`${org}:${userId}`) ?? null;
    this.rows.delete(`${org}:${userId}`);
    return existing;
  }
}

type StoredEmail = OutboundEmailView & { readonly org: string };

export class InMemoryEmailStore implements EmailStore {
  private readonly rows: StoredEmail[] = [];

  private view(row: StoredEmail): OutboundEmailView {
    const { org, ...view } = row;
    void org;
    return view;
  }

  async begin(email: NewOutboundEmail) {
    const row: StoredEmail = {
      org: email.organizationId,
      id: randomUUID(),
      workItemId: email.workItemId,
      fromEmail: email.fromEmail,
      to: [...email.to],
      cc: [...email.cc],
      subject: email.subject,
      body: email.body,
      mode: email.mode,
      status: 'pending',
      error: null,
      gmailDraftId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.rows.push(row);
    return this.view(row);
  }

  async finish(org: string, id: string, outcome: EmailOutcome) {
    const i = this.rows.findIndex((r) => r.org === org && r.id === id);
    const row = this.rows[i];
    if (row === undefined) return null;
    const next: StoredEmail = {
      ...row,
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      gmailDraftId: outcome.status === 'done' ? (outcome.draftId ?? null) : null,
      completedAt: new Date().toISOString(),
    };
    this.rows[i] = next;
    return this.view(next);
  }

  async listForTask(org: string, workItemId: string) {
    return this.rows
      .filter((r) => r.org === org && r.workItemId === workItemId)
      .reverse()
      .map((r) => this.view(r));
  }

  async hasPending(org: string, workItemId: string, since: Date) {
    return this.rows.some(
      (r) =>
        r.org === org &&
        r.workItemId === workItemId &&
        r.status === 'pending' &&
        Date.parse(r.createdAt) > since.getTime(),
    );
  }
}

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

const { googleConnections, outboundEmails, auditEvents } = schema;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function emailView(row: typeof outboundEmails.$inferSelect): OutboundEmailView {
  return {
    id: row.id,
    workItemId: row.workItemId,
    fromEmail: row.fromEmail,
    to: strings(row.to),
    cc: strings(row.cc),
    subject: row.subject,
    body: row.body,
    mode: row.mode,
    status: row.status,
    error: row.error,
    gmailDraftId: row.gmailDraftId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export class DrizzleConnectionStore implements ConnectionStore {
  constructor(private readonly db: DonnaDatabase) {}

  async get(org: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(googleConnections)
      .where(and(eq(googleConnections.organizationId, org), eq(googleConnections.userId, userId)));
    return row === undefined
      ? null
      : {
          organizationId: row.organizationId,
          userId: row.userId,
          email: row.email,
          refreshTokenEnc: row.refreshTokenEnc,
          scopes: strings(row.scopes),
        };
  }

  async save(c: GoogleConnection) {
    const values = {
      email: c.email,
      refreshTokenEnc: c.refreshTokenEnc,
      scopes: [...c.scopes],
      updatedAt: new Date(),
    };
    await this.db
      .insert(googleConnections)
      .values({ organizationId: c.organizationId, userId: c.userId, ...values })
      .onConflictDoUpdate({
        target: [googleConnections.organizationId, googleConnections.userId],
        set: values,
      });
  }

  async remove(org: string, userId: string) {
    const existing = await this.get(org, userId);
    if (existing === null) return null;
    await this.db
      .delete(googleConnections)
      .where(and(eq(googleConnections.organizationId, org), eq(googleConnections.userId, userId)));
    return existing;
  }
}

export class DrizzleEmailStore implements EmailStore {
  constructor(private readonly db: DonnaDatabase) {}

  async begin(email: NewOutboundEmail) {
    const [row] = await this.db
      .insert(outboundEmails)
      .values({
        organizationId: email.organizationId,
        workItemId: email.workItemId,
        userId: email.userId,
        fromEmail: email.fromEmail,
        to: [...email.to],
        cc: [...email.cc],
        subject: email.subject,
        body: email.body,
        mode: email.mode,
      })
      .returning();
    return emailView(row!);
  }

  async finish(org: string, id: string, outcome: EmailOutcome) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(outboundEmails)
        .set({
          status: outcome.status,
          completedAt: new Date(),
          ...(outcome.status === 'done'
            ? { gmailMessageId: outcome.messageId, gmailDraftId: outcome.draftId ?? null }
            : { error: outcome.error }),
        })
        .where(and(eq(outboundEmails.organizationId, org), eq(outboundEmails.id, id)))
        .returning();
      if (row === undefined) return null;
      // Client-facing comms are approval-sensitive: keep the compliance record.
      if (row.mode === 'send') {
        const scope = { to: row.to, cc: row.cc, subject: row.subject, from: row.fromEmail };
        await tx.insert(auditEvents).values({
          organizationId: org,
          actorType: 'human',
          actorId: row.userId,
          action: 'email.send',
          targetResource: `work_item:${row.workItemId}`,
          requestedScope: scope,
          approvedScope: scope,
          result: outcome.status === 'done' ? 'sent' : `failed:${outcome.error}`,
          artifactRef: `outbound_email:${row.id}`,
        });
      }
      return emailView(row);
    });
  }

  async listForTask(org: string, workItemId: string) {
    const rows = await this.db
      .select()
      .from(outboundEmails)
      .where(and(eq(outboundEmails.organizationId, org), eq(outboundEmails.workItemId, workItemId)))
      .orderBy(desc(outboundEmails.createdAt));
    return rows.map(emailView);
  }

  async hasPending(org: string, workItemId: string, since: Date) {
    const rows = await this.db
      .select({ id: outboundEmails.id })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.organizationId, org),
          eq(outboundEmails.workItemId, workItemId),
          eq(outboundEmails.status, 'pending'),
          gt(outboundEmails.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
