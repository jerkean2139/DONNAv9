import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PrincipalContext } from '@donna/policy';
import { createDatabase, schema, type DonnaDatabase } from '@donna/db';
import { runMigrations } from 'graphile-worker';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzlePrincipalResolver } from './auth/principal-resolver.js';
import { DrizzleObjectiveService } from './services/drizzle-objective-service.js';
import { DrizzleTaskDispatcher } from './services/task-dispatcher.js';

/**
 * Live-database integration harness (plan §16). It exercises the real Drizzle
 * services and the transactional `add_job` against a Postgres named by
 * `TEST_DATABASE_URL`, proving the transactional-outbox invariants end to end.
 *
 * It is skipped unless `TEST_DATABASE_URL` is set, so unit CI (no database) stays
 * green; a developer or a DB-backed CI job runs it by pointing the variable at a
 * throwaway Postgres (e.g. `infra/docker`). Never point it at production.
 */
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/db/migrations',
);

/** Seed the tenancy rows the objective/task FKs require; returns a principal. */
async function seedTenant(db: DonnaDatabase): Promise<PrincipalContext> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  await db
    .insert(schema.organizations)
    .values({ id: organizationId, name: 'Acme', slug: `acme-${organizationId.slice(0, 8)}` });
  await db
    .insert(schema.users)
    .values({ id: userId, organizationId, email: `${userId}@x.com`, displayName: 'Test' });
  return {
    userId,
    organizationId,
    role: 'owner',
    actorKind: 'human',
    teamIds: [],
    projectIds: [],
  };
}

describe.skipIf(!TEST_DATABASE_URL)('control-plane persistence (integration)', () => {
  let db: DonnaDatabase;

  beforeAll(async () => {
    await runMigrations({ connectionString: TEST_DATABASE_URL! });
    db = createDatabase(TEST_DATABASE_URL!);
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  it('persists an objective and writes objective.created to the outbox', async () => {
    const principal = await seedTenant(db);
    const svc = new DrizzleObjectiveService(db);

    const objective = await svc.create(
      {
        requestedOutcome: 'Ship Route 40',
        definitionOfDone: 'Launched',
        scope: 'ORGANIZATION',
        riskLevel: 'low',
      },
      principal,
    );

    expect(await svc.get(objective.id, principal.organizationId)).not.toBeNull();
    const events = await db.execute(
      sql`select dispatched_at from events where type = 'objective.created' and objective_id = ${objective.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.dispatched_at).toBeNull();
  });

  it('resolves a verified token subject to the trusted principal (role from the DB)', async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const sub = `user_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.organizations).values({ id: organizationId, name: 'Acme', slug: sub });
    await db.insert(schema.users).values({
      id: userId,
      organizationId,
      email: `${userId}@x.com`,
      displayName: 'Test',
      externalAuthId: sub,
    });
    await db
      .insert(schema.memberships)
      .values({ organizationId, userId, teamId: null, role: 'executive' });

    const resolver = new DrizzlePrincipalResolver(db);
    const principal = await resolver.resolve({ subject: sub, claims: { sub } });
    expect(principal).not.toBeNull();
    expect(principal!.userId).toBe(userId);
    expect(principal!.organizationId).toBe(organizationId);
    expect(principal!.role).toBe('executive');
    expect(principal!.actorKind).toBe('human');

    // An unknown subject resolves to null (no leak, no default access).
    expect(await resolver.resolve({ subject: 'nobody', claims: { sub: 'nobody' } })).toBeNull();
  });

  it('reads are tenant-scoped: another org gets null', async () => {
    const owner = await seedTenant(db);
    const other = await seedTenant(db);
    const svc = new DrizzleObjectiveService(db);
    const objective = await svc.create(
      { requestedOutcome: 'x', definitionOfDone: 'y', scope: 'ORGANIZATION', riskLevel: 'low' },
      owner,
    );
    expect(await svc.get(objective.id, owner.organizationId)).not.toBeNull();
    expect(await svc.get(objective.id, other.organizationId)).toBeNull();
  });

  it('dispatches a task: task + task.created + job, atomically', async () => {
    const principal = await seedTenant(db);
    const objective = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'x', definitionOfDone: 'y', scope: 'ORGANIZATION', riskLevel: 'low' },
      principal,
    );
    const { task, jobId } = await new DrizzleTaskDispatcher(db).dispatch(
      {
        objectiveId: objective.id,
        goal: 'Summarize',
        definitionOfDone: 'A summary',
        requiredCapabilities: ['reasoning'],
        needsReasoning: true,
        reasoningTier: 5,
        modelRequest: { messages: [{ role: 'user', content: 'summarize' }] },
      },
      principal,
    );

    expect(jobId).not.toBe('');
    const taskRows = await db.execute(
      sql`select status, required_capabilities from tasks where id = ${task.id}`,
    );
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]!.status).toBe('pending');

    const events = await db.execute(
      sql`select dispatched_at from events where type = 'task.created' and task_id = ${task.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.dispatched_at).toBeNull();

    const jobs = await db.execute(
      sql`select task_identifier, key from graphile_worker.jobs where key = ${task.id}`,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.task_identifier).toBe('execute-work-order');
    const payloads = await db.execute(
      sql`select payload from graphile_worker._private_jobs where key = ${task.id}`,
    );
    expect((payloads[0]!.payload as { taskId: string }).taskId).toBe(task.id);
  });

  it('rolls back the whole dispatch when the objective FK is violated', async () => {
    const principal = await seedTenant(db);
    const dispatcher = new DrizzleTaskDispatcher(db);
    const before = await db.execute(sql`select count(*)::int as n from tasks`);
    const jobsBefore = await db.execute(sql`select count(*)::int as n from graphile_worker.jobs`);

    await expect(
      dispatcher.dispatch(
        {
          objectiveId: randomUUID(),
          goal: 'orphan',
          definitionOfDone: 'x',
          requiredCapabilities: [],
        },
        principal,
      ),
    ).rejects.toThrow();

    const after = await db.execute(sql`select count(*)::int as n from tasks`);
    const jobsAfter = await db.execute(sql`select count(*)::int as n from graphile_worker.jobs`);
    expect(after[0]!.n).toBe(before[0]!.n);
    expect(jobsAfter[0]!.n).toBe(jobsBefore[0]!.n);
  });
});
