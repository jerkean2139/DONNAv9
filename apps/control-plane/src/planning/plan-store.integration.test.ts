import { randomUUID } from 'node:crypto';

import { createDatabase, runDrizzleMigrations, schema, type DonnaDatabase } from '@donna/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Plan } from './plan.js';
import { DrizzlePlanStore, InMemoryPlanStore, type PlanStore } from './plan-store.js';

// Live-database check, skipped unless TEST_DATABASE_URL points at a throwaway
// Postgres. The in-memory store runs the same assertions unconditionally.
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

const PLAN: Plan = {
  summary: 's',
  client: { kind: 'none' },
  project: { kind: 'new', name: 'P' },
  sprint: null,
  tasks: [{ title: 't', subtasks: [], owner: 'you' }],
  questions: [],
};

let db: DonnaDatabase;

async function seed(): Promise<{ org: string; user: string; objective: string; project: string }> {
  const org = randomUUID();
  const user = randomUUID();
  await db.insert(schema.organizations).values({ id: org, name: 'O', slug: `o-${org}` });
  await db
    .insert(schema.users)
    .values({ id: user, organizationId: org, email: `${user}@x.io`, displayName: 'U' });
  const [o] = await db
    .insert(schema.objectives)
    .values({
      organizationId: org,
      scope: 'ORGANIZATION',
      requesterId: user,
      ownerId: user,
      requestedOutcome: 'x',
      definitionOfDone: 'y',
    })
    .returning({ id: schema.objectives.id });
  const [p] = await db
    .insert(schema.projects)
    .values({ organizationId: org, name: 'P' })
    .returning({ id: schema.projects.id });
  return { org, user, objective: o!.id, project: p!.id };
}

async function exercise(
  store: PlanStore,
  ids: { org: string; user: string; objective: string; project: string },
) {
  const { org, objective } = ids;
  const drafting = await store.startDrafting(org, objective);
  expect(drafting).toMatchObject({ objectiveId: objective, status: 'drafting', plan: null });

  const proposed = await store.transition(org, objective, {
    status: 'proposed',
    plan: PLAN,
    model: 'm',
    costUsd: 0.01,
  });
  expect(proposed).toMatchObject({ status: 'proposed', plan: PLAN, model: 'm' });

  // Restarting replaces the plan in place (one row per objective).
  const again = await store.startDrafting(org, objective);
  expect(again).toMatchObject({ status: 'drafting', plan: null, model: null });
  expect(await store.list(org, [objective])).toHaveLength(1);

  await store.transition(org, objective, { status: 'failed', error: 'declined' });
  expect(await store.get(org, objective)).toMatchObject({ status: 'failed', error: 'declined' });

  await store.transition(org, objective, {
    status: 'proposed',
    plan: PLAN,
    model: 'm',
    costUsd: 0,
  });
  const approved = await store.transition(org, objective, {
    status: 'approved',
    projectId: ids.project,
    approvedBy: ids.user,
  });
  expect(approved).toMatchObject({ status: 'approved', projectId: ids.project });

  // Another tenant sees and changes nothing.
  const stranger = randomUUID();
  expect(await store.get(stranger, objective)).toBeNull();
  expect(await store.list(stranger, [objective])).toEqual([]);
  expect(await store.transition(stranger, objective, { status: 'dismissed' })).toBeNull();
  expect((await store.get(org, objective))!.status).toBe('approved');
}

describe('InMemoryPlanStore', () => {
  it('follows the plan lifecycle', async () => {
    const ids = {
      org: randomUUID(),
      user: randomUUID(),
      objective: randomUUID(),
      project: randomUUID(),
    };
    await exercise(new InMemoryPlanStore(), ids);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('DrizzlePlanStore (integration)', () => {
  beforeAll(async () => {
    await runDrizzleMigrations(TEST_DATABASE_URL!);
    db = createDatabase(TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  it('follows the plan lifecycle', async () => {
    await exercise(new DrizzlePlanStore(db), await seed());
  });

  it('cannot attach a plan to another tenant’s objective', async () => {
    const a = await seed();
    const b = await seed();
    await expect(new DrizzlePlanStore(db).startDrafting(b.org, a.objective)).rejects.toThrow();
  });
});
