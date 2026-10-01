import { randomUUID } from 'node:crypto';

import { createDatabase, runDrizzleMigrations, schema, type DonnaDatabase } from '@donna/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DrizzleConnectionStore,
  DrizzleEmailStore,
  InMemoryConnectionStore,
  InMemoryEmailStore,
  type ConnectionStore,
  type EmailStore,
} from './stores.js';

// Live-database check, skipped unless TEST_DATABASE_URL points at a throwaway
// Postgres. The in-memory stores run the same assertions unconditionally.
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

interface Ids {
  readonly org: string;
  readonly user: string;
  readonly task: string;
}

let db: DonnaDatabase;

async function seed(): Promise<Ids> {
  const org = randomUUID();
  const user = randomUUID();
  await db.insert(schema.organizations).values({ id: org, name: 'O', slug: `o-${org}` });
  await db
    .insert(schema.users)
    .values({ id: user, organizationId: org, email: `${user}@x.io`, displayName: 'U' });
  const [p] = await db
    .insert(schema.projects)
    .values({ organizationId: org, name: 'P' })
    .returning({ id: schema.projects.id });
  const [t] = await db
    .insert(schema.workItems)
    .values({ organizationId: org, projectId: p!.id, title: 'Email Ana', createdBy: user })
    .returning({ id: schema.workItems.id });
  return { org, user, task: t!.id };
}

async function exercise(connections: ConnectionStore, emails: EmailStore, ids: Ids) {
  const { org, user, task } = ids;
  const conn = { organizationId: org, userId: user, scopes: ['email'] };
  await connections.save({ ...conn, email: 'a@acme.co', refreshTokenEnc: 'sealed-1' });
  await connections.save({ ...conn, email: 'b@acme.co', refreshTokenEnc: 'sealed-2' });
  expect(await connections.get(org, user)).toMatchObject({
    email: 'b@acme.co',
    refreshTokenEnc: 'sealed-2',
  });
  expect(await connections.get(randomUUID(), user)).toBeNull();

  const pending = await emails.begin({
    organizationId: org,
    workItemId: task,
    userId: user,
    fromEmail: 'b@acme.co',
    to: ['ana@acme.co'],
    cc: [],
    subject: 'Hi',
    body: 'Hello',
    mode: 'send',
  });
  expect(pending).toMatchObject({ status: 'pending', to: ['ana@acme.co'], completedAt: null });
  expect(await emails.hasPending(org, task, new Date(Date.now() - 60_000))).toBe(true);
  expect(await emails.hasPending(org, task, new Date(Date.now() + 60_000))).toBe(false);

  const done = await emails.finish(org, pending.id, { status: 'done', messageId: 'm-1' });
  expect(done).toMatchObject({ status: 'done', error: null });
  expect(done?.completedAt).not.toBeNull();
  expect(await emails.hasPending(org, task, new Date(0))).toBe(false);
  expect(
    await emails.finish(randomUUID(), pending.id, { status: 'failed', error: 'x' }),
  ).toBeNull();

  const list = await emails.listForTask(org, task);
  expect(list.map((e) => e.id)).toEqual([pending.id]);
  expect(await emails.listForTask(randomUUID(), task)).toEqual([]);

  expect(await connections.remove(org, user)).toMatchObject({ email: 'b@acme.co' });
  expect(await connections.get(org, user)).toBeNull();
  expect(await connections.remove(org, user)).toBeNull();
}

describe('in-memory Gmail stores', () => {
  it('store connections and the email log', async () => {
    await exercise(new InMemoryConnectionStore(), new InMemoryEmailStore(), {
      org: randomUUID(),
      user: randomUUID(),
      task: randomUUID(),
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('Drizzle Gmail stores (integration)', () => {
  beforeAll(async () => {
    await runDrizzleMigrations(TEST_DATABASE_URL!);
    db = createDatabase(TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  it('store connections and the email log', async () => {
    await exercise(new DrizzleConnectionStore(db), new DrizzleEmailStore(db), await seed());
  });

  it('writes an audit event for every send', async () => {
    const ids = await seed();
    const emails = new DrizzleEmailStore(db);
    const sent = await emails.begin({
      organizationId: ids.org,
      workItemId: ids.task,
      userId: ids.user,
      fromEmail: 'me@acme.co',
      to: ['ana@acme.co'],
      cc: ['bo@acme.co'],
      subject: 'Hi',
      body: 'Hello',
      mode: 'send',
    });
    await emails.finish(ids.org, sent.id, { status: 'done', messageId: 'm-1' });
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, ids.org)));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'human',
      actorId: ids.user,
      action: 'email.send',
      result: 'sent',
      artifactRef: `outbound_email:${sent.id}`,
      approvedScope: { to: ['ana@acme.co'], cc: ['bo@acme.co'], subject: 'Hi', from: 'me@acme.co' },
    });
  });

  it('cannot log an email against another tenant’s task or user', async () => {
    const a = await seed();
    const b = await seed();
    await expect(
      new DrizzleEmailStore(db).begin({
        organizationId: b.org,
        workItemId: a.task,
        userId: b.user,
        fromEmail: 'x@y.co',
        to: ['z@y.co'],
        cc: [],
        subject: 's',
        body: 'b',
        mode: 'draft',
      }),
    ).rejects.toThrow();
    await expect(
      new DrizzleConnectionStore(db).save({
        organizationId: b.org,
        userId: a.user,
        email: 'x@y.co',
        refreshTokenEnc: 's',
        scopes: [],
      }),
    ).rejects.toThrow();
  });
});
