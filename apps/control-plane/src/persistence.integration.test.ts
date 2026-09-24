import { randomUUID } from 'node:crypto';

import type { PrincipalContext } from '@donna/policy';
import { createDatabase, runDrizzleMigrations, schema, type DonnaDatabase } from '@donna/db';
import { runMigrations } from 'graphile-worker';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzlePrincipalResolver } from './auth/principal-resolver.js';
import { DrizzleBusinessConstitutionService } from './services/drizzle-business-constitution-service.js';
import { DrizzleBusinessGraphService } from './services/drizzle-business-graph-service.js';
import { DrizzleObjectiveService } from './services/drizzle-objective-service.js';
import { DrizzleTaskDispatcher } from './services/task-dispatcher.js';
import { DrizzleProvisioningService } from './webhooks/provisioning.js';

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
    await runDrizzleMigrations(TEST_DATABASE_URL!);
    db = createDatabase(TEST_DATABASE_URL!);
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

  it('populates principal.projectIds from project_memberships (SEC-3a)', async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const projectId = randomUUID();
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
      .values({ organizationId, userId, teamId: null, role: 'team_member' });
    await db
      .insert(schema.projects)
      .values({ id: projectId, organizationId, name: 'Route 40', scope: 'PROJECT' });
    await db.insert(schema.projectMemberships).values({ organizationId, projectId, userId });

    const principal = await new DrizzlePrincipalResolver(db).resolve({
      subject: sub,
      claims: { sub },
    });
    expect(principal).not.toBeNull();
    // Project access comes from OUR database, scoped to the user's org.
    expect(principal!.projectIds).toEqual([projectId]);
  });

  it('provisions org + user + membership from a Clerk membership event, then resolves', async () => {
    const suffix = randomUUID().slice(0, 8);
    const clerkOrgId = `org_${suffix}`;
    const clerkUserId = `user_${suffix}`;
    const provisioning = new DrizzleProvisioningService(db);

    await provisioning.handle({
      type: 'organizationMembership.created',
      data: {
        role: 'org:admin',
        organization: { id: clerkOrgId, name: 'Acme', slug: `acme-${suffix}` },
        public_user_data: { user_id: clerkUserId, identifier: `${suffix}@x.com`, first_name: 'J' },
      },
    });

    // The provisioned member is now authorizable: the resolver maps the token
    // subject to the trusted principal with the mapped role.
    const principal = await new DrizzlePrincipalResolver(db).resolve({
      subject: clerkUserId,
      claims: { sub: clerkUserId },
    });
    expect(principal).not.toBeNull();
    expect(principal!.role).toBe('admin');
    expect(principal!.actorKind).toBe('human');

    // A second sync is idempotent (updates role, no duplicate membership).
    await provisioning.handle({
      type: 'organizationMembership.updated',
      data: {
        role: 'org:member',
        organization: { id: clerkOrgId, name: 'Acme', slug: `acme-${suffix}` },
        public_user_data: { user_id: clerkUserId, identifier: `${suffix}@x.com` },
      },
    });
    const rescoped = await new DrizzlePrincipalResolver(db).resolve({
      subject: clerkUserId,
      claims: { sub: clerkUserId },
    });
    expect(rescoped!.role).toBe('team_member');

    // Revoking the user clears the mapping: the same token no longer resolves.
    await provisioning.handle({ type: 'user.deleted', data: { id: clerkUserId, deleted: true } });
    expect(
      await new DrizzlePrincipalResolver(db).resolve({
        subject: clerkUserId,
        claims: { sub: clerkUserId },
      }),
    ).toBeNull();
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

  // SEC-3b: composite (organization_id, id) foreign keys reject a row that
  // points at a parent in a DIFFERENT organization — defense-in-depth beneath
  // the policy engine. The single-column FK alone would accept these (the
  // referenced row exists); only the composite FK catches the tenant mismatch.
  it('rejects a task whose objective belongs to another organization', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const objectiveA = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'x', definitionOfDone: 'y', scope: 'ORGANIZATION', riskLevel: 'low' },
      orgA,
    );
    // A task in orgB that points at orgA's objective must fail at the DB.
    await expect(
      db.insert(schema.tasks).values({
        id: randomUUID(),
        organizationId: orgB.organizationId,
        objectiveId: objectiveA.id,
        goal: 'cross-tenant',
        definitionOfDone: 'nope',
      }),
    ).rejects.toThrow();
  });

  it('rejects a task_dependency edge that crosses the tenant boundary', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const objectiveA = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'a', definitionOfDone: 'a', scope: 'ORGANIZATION', riskLevel: 'low' },
      orgA,
    );
    const objectiveB = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'b', definitionOfDone: 'b', scope: 'ORGANIZATION', riskLevel: 'low' },
      orgB,
    );
    const taskA = randomUUID();
    const taskB = randomUUID();
    await db.insert(schema.tasks).values({
      id: taskA,
      organizationId: orgA.organizationId,
      objectiveId: objectiveA.id,
      goal: 'a',
      definitionOfDone: 'a',
    });
    await db.insert(schema.tasks).values({
      id: taskB,
      organizationId: orgB.organizationId,
      objectiveId: objectiveB.id,
      goal: 'b',
      definitionOfDone: 'b',
    });
    // An orgB dependency that depends on orgA's task must fail at the DB.
    await expect(
      db.insert(schema.taskDependencies).values({
        organizationId: orgB.organizationId,
        taskId: taskB,
        dependsOnTaskId: taskA,
      }),
    ).rejects.toThrow();
  });

  it('rejects an event that references another organization’s objective', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const objectiveA = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'x', definitionOfDone: 'y', scope: 'ORGANIZATION', riskLevel: 'low' },
      orgA,
    );
    await expect(
      db.insert(schema.events).values({
        id: randomUUID(),
        organizationId: orgB.organizationId,
        objectiveId: objectiveA.id,
        type: 'objective.created',
        actorType: 'human',
        actorId: orgB.userId,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it('rejects a membership whose user belongs to another organization', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    // orgB membership pointing at orgA's user must fail at the DB.
    await expect(
      db.insert(schema.memberships).values({
        organizationId: orgB.organizationId,
        userId: orgA.userId,
        teamId: null,
        role: 'team_member',
      }),
    ).rejects.toThrow();
  });

  it('rejects a Business Graph relationship whose source entity belongs to another organization', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const [entityA] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: orgA.organizationId,
        entityType: 'client',
        name: 'Org A Client',
        confidence: 'AUTHORITATIVE',
      })
      .returning();
    const [entityB] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: orgB.organizationId,
        entityType: 'project',
        name: 'Org B Project',
        confidence: 'PRIMARY',
      })
      .returning();

    await expect(
      db.insert(schema.businessRelationships).values({
        organizationId: orgB.organizationId,
        fromEntityId: entityA!.id,
        toEntityId: entityB!.id,
        relationshipType: 'belongs_to',
        confidence: 'UNVERIFIED',
      }),
    ).rejects.toThrow();
  });

  it('rejects a Business Graph relationship whose target entity belongs to another organization', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const [entityA] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: orgA.organizationId,
        entityType: 'client',
        name: 'Org A Client',
      })
      .returning();
    const [entityB] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: orgB.organizationId,
        entityType: 'system',
        name: 'Org B System',
      })
      .returning();

    await expect(
      db.insert(schema.businessRelationships).values({
        organizationId: orgA.organizationId,
        fromEntityId: entityA!.id,
        toEntityId: entityB!.id,
        relationshipType: 'uses',
      }),
    ).rejects.toThrow();
  });

  it('accepts an in-tenant Business Graph relationship with provenance', async () => {
    const org = await seedTenant(db);
    const [client] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: org.organizationId,
        entityType: 'client',
        name: 'Acme Client',
        sourceSystem: 'crm',
        sourceRef: 'client-123',
        confidence: 'AUTHORITATIVE',
      })
      .returning();
    const [project] = await db
      .insert(schema.businessEntities)
      .values({
        organizationId: org.organizationId,
        entityType: 'project',
        name: 'Website',
        sourceSystem: 'project_manager',
        sourceRef: 'project-456',
        confidence: 'PRIMARY',
      })
      .returning();

    const [relationship] = await db
      .insert(schema.businessRelationships)
      .values({
        organizationId: org.organizationId,
        fromEntityId: project!.id,
        toEntityId: client!.id,
        relationshipType: 'belongs_to',
        sourceSystem: 'project_manager',
        sourceRef: 'project-456',
        confidence: 'PRIMARY',
      })
      .returning();

    expect(relationship!.organizationId).toBe(org.organizationId);
    expect(relationship!.relationshipType).toBe('belongs_to');
    expect(relationship!.sourceSystem).toBe('project_manager');
  });

  it('Business Graph service hides another tenant’s entity and relationships', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const svc = new DrizzleBusinessGraphService(db);
    const client = await svc.createEntity(orgA.organizationId, {
      entityType: 'client',
      name: 'Private Client',
      sourceSystem: 'crm',
      sourceRef: 'private-1',
      confidence: 'AUTHORITATIVE',
    });
    const project = await svc.createEntity(orgA.organizationId, {
      entityType: 'project',
      name: 'Private Project',
    });
    await svc.createRelationship(orgA.organizationId, {
      fromEntityId: project.id,
      toEntityId: client.id,
      relationshipType: 'belongs_to',
    });

    expect(await svc.getEntity(client.id, orgA.organizationId)).not.toBeNull();
    expect(await svc.getEntity(client.id, orgB.organizationId)).toBeNull();
    expect(await svc.listRelationships(orgA.organizationId, client.id)).toHaveLength(1);
    expect(await svc.listRelationships(orgB.organizationId, client.id)).toHaveLength(0);
  });

  it('Business Constitution proposals do not become active until a human approves them', async () => {
    const org = await seedTenant(db);
    const svc = new DrizzleBusinessConstitutionService(db);
    const proposal = await svc.propose(org.organizationId, org.userId, [
      {
        kind: 'role_authority',
        key: 'external_send',
        statement: 'External sends require approval.',
        action: 'external.send',
        requiresApproval: true,
      },
    ]);

    expect(proposal.constitution.status).toBe('proposed');
    expect(await svc.getActive(org.organizationId)).toBeNull();

    expect(await svc.approve(org.organizationId, proposal.constitution.id, org.userId, 'agent')).toBeNull();
    expect(await svc.getActive(org.organizationId)).toBeNull();

    const approved = await svc.approve(
      org.organizationId,
      proposal.constitution.id,
      org.userId,
      'human',
    );
    expect(approved!.constitution.status).toBe('approved');
    expect(approved!.rules[0]!.requiresApproval).toBe(true);
    expect((await svc.getActive(org.organizationId))!.constitution.id).toBe(proposal.constitution.id);
  });

  it('Business Constitution is tenant-isolated at proposal and approval boundaries', async () => {
    const orgA = await seedTenant(db);
    const orgB = await seedTenant(db);
    const svc = new DrizzleBusinessConstitutionService(db);
    const proposal = await svc.propose(orgA.organizationId, orgA.userId, [
      {
        kind: 'never_autonomous',
        key: 'delete_production',
        statement: 'Never delete production data autonomously.',
        action: 'production.delete',
        neverAutonomous: true,
        requiresApproval: true,
      },
    ]);

    expect(await svc.getActive(orgB.organizationId)).toBeNull();
    expect(
      await svc.approve(orgB.organizationId, proposal.constitution.id, orgB.userId, 'human'),
    ).toBeNull();

    await expect(
      db.insert(schema.constitutionRules).values({
        organizationId: orgB.organizationId,
        constitutionId: proposal.constitution.id,
        kind: 'ai_boundary',
        key: 'cross_tenant',
        statement: 'Must fail.',
      }),
    ).rejects.toThrow();
  });

  it('still accepts an in-tenant task, dependency, and event (sanity)', async () => {
    const org = await seedTenant(db);
    const objective = await new DrizzleObjectiveService(db).create(
      { requestedOutcome: 'x', definitionOfDone: 'y', scope: 'ORGANIZATION', riskLevel: 'low' },
      org,
    );
    const t1 = randomUUID();
    const t2 = randomUUID();
    await db.insert(schema.tasks).values([
      {
        id: t1,
        organizationId: org.organizationId,
        objectiveId: objective.id,
        goal: 'one',
        definitionOfDone: 'x',
      },
      {
        id: t2,
        organizationId: org.organizationId,
        objectiveId: objective.id,
        goal: 'two',
        definitionOfDone: 'x',
        parentTaskId: t1,
      },
    ]);
    await db
      .insert(schema.taskDependencies)
      .values({ organizationId: org.organizationId, taskId: t2, dependsOnTaskId: t1 });
    await db.insert(schema.events).values({
      id: randomUUID(),
      organizationId: org.organizationId,
      objectiveId: objective.id,
      taskId: t1,
      type: 'task.created',
      actorType: 'human',
      actorId: org.userId,
      correlationId: randomUUID(),
    });
    const deps = await db.execute(
      sql`select count(*)::int as n from task_dependencies where organization_id = ${org.organizationId}`,
    );
    expect(deps[0]!.n).toBe(1);
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
