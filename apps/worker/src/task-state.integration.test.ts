import { randomUUID } from 'node:crypto';

import type { EventEnvelope, ObjectiveId, OrganizationId, TaskId } from '@donna/core-domain';
import { createDatabase, runDrizzleMigrations, schema, type DonnaDatabase } from '@donna/db';
import { createEvent } from '@donna/events';
import type { WorkOrder } from '@donna/orchestrator';
import { sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TaskStateStore } from './task-state.js';

/**
 * Live-database integration harness for the SEC-4 task-state store. Skipped
 * unless `TEST_DATABASE_URL` is set (so unit CI stays green); a DB-backed CI job
 * points it at a throwaway Postgres. Never point it at production.
 */
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

interface Seeded {
  readonly organizationId: string;
  readonly objectiveId: string;
  readonly taskId: string;
  readonly order: WorkOrder;
}

/** Seed org → user → objective → task (the FK chain a task row requires). */
async function seedTask(db: DonnaDatabase, retryCount = 0, maxRetries = 3): Promise<Seeded> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const objectiveId = randomUUID();
  const taskId = randomUUID();
  await db
    .insert(schema.organizations)
    .values({ id: organizationId, name: 'Acme', slug: `acme-${organizationId.slice(0, 8)}` });
  await db
    .insert(schema.users)
    .values({ id: userId, organizationId, email: `${userId}@x.com`, displayName: 'T' });
  await db.insert(schema.objectives).values({
    id: objectiveId,
    organizationId,
    scope: 'ORGANIZATION',
    requesterId: userId,
    ownerId: userId,
    requestedOutcome: 'x',
    definitionOfDone: 'y',
    status: 'draft',
    riskLevel: 'low',
  });
  await db.insert(schema.tasks).values({
    id: taskId,
    organizationId,
    objectiveId,
    goal: 'g',
    definitionOfDone: 'd',
    retryCount,
    maxRetries,
  });
  return {
    organizationId,
    objectiveId,
    taskId,
    order: { organizationId, taskId, requiredCapabilities: [] },
  };
}

/** A buffered execution-trace event, as the orchestrator would emit. */
function traceEvent(seeded: Seeded, type: EventEnvelope['type']): EventEnvelope {
  return createEvent({
    type,
    organizationId: seeded.organizationId as OrganizationId,
    actor: { type: 'orchestrator', id: 'orchestrator' },
    taskId: seeded.taskId as TaskId,
    objectiveId: seeded.objectiveId as ObjectiveId,
  });
}

describe.skipIf(!TEST_DATABASE_URL)('worker task-state store (integration)', () => {
  let db: DonnaDatabase;
  let store: TaskStateStore;

  beforeAll(async () => {
    await runMigrations({ connectionString: TEST_DATABASE_URL! });
    await runDrizzleMigrations(TEST_DATABASE_URL!);
    db = createDatabase(TEST_DATABASE_URL!);
    store = new TaskStateStore(db);
  });

  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  async function statusOf(taskId: string): Promise<{ status: string; retry_count: number }> {
    const rows = await db.execute(sql`select status, retry_count from tasks where id = ${taskId}`);
    return rows[0] as unknown as { status: string; retry_count: number };
  }

  async function eventCount(taskId: string, type: string): Promise<number> {
    const rows = await db.execute(
      sql`select count(*)::int as n from events where task_id = ${taskId} and type = ${type}`,
    );
    return (rows[0] as unknown as { n: number }).n;
  }

  it('drives a completed order to a completed task, committing the trace', async () => {
    const seeded = await seedTask(db);
    const outcome = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'completed' },
      events: [traceEvent(seeded, 'worker.started'), traceEvent(seeded, 'task.completed')],
      order: seeded.order,
    });
    expect(outcome).toEqual({ applied: true, status: 'completed', retried: false });
    expect((await statusOf(seeded.taskId)).status).toBe('completed');
    expect(await eventCount(seeded.taskId, 'task.completed')).toBe(1);
    expect(await eventCount(seeded.taskId, 'worker.started')).toBe(1);
  });

  it('parks an approval_required order as awaiting_approval', async () => {
    const seeded = await seedTask(db);
    const outcome = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'approval_required', reason: 'needs_sign_off' },
      events: [traceEvent(seeded, 'approval.requested')],
      order: seeded.order,
    });
    expect(outcome).toEqual({ applied: true, status: 'awaiting_approval', retried: false });
    expect((await statusOf(seeded.taskId)).status).toBe('awaiting_approval');
  });

  it('parks a denied order as blocked (never reaching running)', async () => {
    const seeded = await seedTask(db);
    const outcome = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'denied', reason: 'scope_denied' },
      events: [traceEvent(seeded, 'task.blocked')],
      order: seeded.order,
    });
    expect(outcome).toEqual({ applied: true, status: 'blocked', retried: false });
    expect((await statusOf(seeded.taskId)).status).toBe('blocked');
  });

  it('retries a retryable failure: increments retryCount, emits task.retried, re-enqueues', async () => {
    const seeded = await seedTask(db, 0, 3);
    const outcome = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'failed', reason: 'adapter_error' },
      events: [traceEvent(seeded, 'task.failed')],
      order: seeded.order,
    });
    expect(outcome).toEqual({ applied: true, status: 'pending', retried: true });
    const row = await statusOf(seeded.taskId);
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(1);
    expect(await eventCount(seeded.taskId, 'task.retried')).toBe(1);
    // The retry re-enqueued exactly one job, keyed by task id.
    const jobs = await db.execute(
      sql`select task_identifier from graphile_worker.jobs where key = ${seeded.taskId}`,
    );
    expect(jobs).toHaveLength(1);
    expect((jobs[0] as unknown as { task_identifier: string }).task_identifier).toBe(
      'execute-work-order',
    );
  });

  it('gives up on a failure once retries are exhausted (terminal failed)', async () => {
    const seeded = await seedTask(db, 3, 3);
    const outcome = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'failed', reason: 'adapter_error' },
      events: [traceEvent(seeded, 'task.failed')],
      order: seeded.order,
    });
    expect(outcome).toEqual({ applied: true, status: 'failed', retried: false });
    expect((await statusOf(seeded.taskId)).status).toBe('failed');
    expect(await eventCount(seeded.taskId, 'task.retried')).toBe(0);
    const jobs = await db.execute(
      sql`select 1 from graphile_worker.jobs where key = ${seeded.taskId}`,
    );
    expect(jobs).toHaveLength(0);
  });

  it('is redelivery-safe: a second commit on a terminal task is a no-op', async () => {
    const seeded = await seedTask(db);
    await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'completed' },
      events: [traceEvent(seeded, 'task.completed')],
      order: seeded.order,
    });
    const second = await store.commitOutcome({
      taskId: seeded.taskId,
      organizationId: seeded.organizationId,
      result: { status: 'completed' },
      events: [traceEvent(seeded, 'task.completed')],
      order: seeded.order,
    });
    expect(second).toEqual({ applied: false, reason: 'already_terminal' });
    // No duplicate event from the redelivered attempt.
    expect(await eventCount(seeded.taskId, 'task.completed')).toBe(1);
  });

  it('reports not_found for an unknown task', async () => {
    const outcome = await store.commitOutcome({
      taskId: randomUUID(),
      organizationId: randomUUID(),
      result: { status: 'completed' },
      events: [],
      order: { organizationId: randomUUID(), requiredCapabilities: [] },
    });
    expect(outcome).toEqual({ applied: false, reason: 'not_found' });
  });
});
