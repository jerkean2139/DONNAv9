import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from './auth/authenticate.js';
import { buildServer } from './server.js';
import { InMemoryObjectiveService } from './services/objective-service.js';
import { InMemoryTaskDispatcher } from './services/task-dispatcher.js';
import { InMemoryTaskService } from './services/task-service.js';
import { InMemoryWorkQueue } from './services/work-queue.js';

function makeApp() {
  const bus = new InMemoryEventBus();
  const publishedTypes: string[] = [];
  bus.subscribe('*', (e) => {
    publishedTypes.push(e.type);
  });
  const workQueue = new InMemoryWorkQueue();
  const app = buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(new InMemoryTaskService(bus), workQueue),
    authenticate: devAuthenticator(),
  });
  return { app, publishedTypes, workQueue };
}

/** Create an objective via the API and return its id. */
async function createObjective(app: ReturnType<typeof makeApp>['app']): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/objectives',
    headers: memberHeaders,
    payload: { requestedOutcome: 'Ship Route 40', definitionOfDone: 'Launched' },
  });
  return res.json().id as string;
}

const memberHeaders = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'agent',
  'x-donna-teams': 'teamA',
};

// A principal in a different organization — used for tenant-isolation checks.
const otherOrgHeaders = {
  'x-donna-user-id': 'u9',
  'x-donna-org-id': 'org2',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'agent',
};

// A different user in the SAME organization — used for scope checks on reads.
const sameOrgOtherUserHeaders = {
  'x-donna-user-id': 'u2',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'agent',
  'x-donna-teams': 'teamA',
};

/** Create an objective with an explicit scope as the given member. */
async function createScoped(
  app: ReturnType<typeof makeApp>['app'],
  scope: string,
  headers: Record<string, string> = memberHeaders,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/objectives',
    headers,
    payload: { requestedOutcome: 'x', definitionOfDone: 'y', scope, ...extra },
  });
  return res.json().id as string;
}

describe('control-plane API', () => {
  it('reports health', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('rejects an unauthenticated objective create', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      payload: { requestedOutcome: 'x', definitionOfDone: 'y' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates the request body', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      headers: memberHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates an objective and emits objective.created', async () => {
    const { app, publishedTypes } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      headers: memberHeaders,
      payload: { requestedOutcome: 'Ship Route 40', definitionOfDone: 'Launched' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('draft');
    expect(body.ownerId).toBe('u1');
    expect(publishedTypes).toContain('objective.created');
  });

  it('denies a team-scoped objective for a non-member (policy enforced server-side)', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/objectives',
      headers: memberHeaders,
      payload: {
        requestedOutcome: 'x',
        definitionOfDone: 'y',
        scope: 'TEAM',
        teamId: 'teamB',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('scope_denied');
  });

  it('requires authentication to read an objective', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/objectives/does-not-exist' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a missing objective', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/objectives/does-not-exist',
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it('does not leak an objective across the tenant boundary', async () => {
    const ctx = makeApp();
    const objectiveId = await createObjective(ctx.app);

    // The owner (org1) can read it; a principal in org2 gets 404, not the row.
    const own = await ctx.app.inject({
      method: 'GET',
      url: `/objectives/${objectiveId}`,
      headers: memberHeaders,
    });
    expect(own.statusCode).toBe(200);

    const cross = await ctx.app.inject({
      method: 'GET',
      url: `/objectives/${objectiveId}`,
      headers: otherOrgHeaders,
    });
    expect(cross.statusCode).toBe(404);
  });

  // SEC-2: scoped reads are authorized through the policy engine, not just the
  // tenant filter. Unauthorized reads return 404 (never leak existence).
  it('lets any same-org member read an ORGANIZATION-scoped objective', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'ORGANIZATION');
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: sameOrgOtherUserHeaders,
    });
    expect(res.statusCode).toBe(200);
  });

  it('lets the owner read their own PRIVATE objective', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'PRIVATE');
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
  });

  it('hides a PRIVATE objective from a different same-org user (404, no leak)', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'PRIVATE'); // owned by u1
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: sameOrgOtherUserHeaders, // u2, same org
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  it('does not grant an admin cross-user access to a PRIVATE objective', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'PRIVATE'); // owned by u1
    const adminHeaders = {
      'x-donna-user-id': 'admin1',
      'x-donna-org-id': 'org1',
      'x-donna-role': 'executive',
      'x-donna-actor-kind': 'human',
    };
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: adminHeaders,
    });
    // No role bypasses PRIVATE scope — reads stay fail-closed.
    expect(res.statusCode).toBe(404);
  });

  // SEC-3a: the objective now carries its owning team (persisted as scope_ref),
  // so a TEAM-scoped read can reconstruct membership and authorize any member of
  // that team — not just the owner.
  it('lets a fellow team member read a TEAM-scoped objective', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'TEAM', memberHeaders, { teamId: 'teamA' });
    // u2 is a different user in org1 who is also on teamA.
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: sameOrgOtherUserHeaders,
    });
    expect(res.statusCode).toBe(200);
  });

  it('hides a TEAM-scoped objective from a same-org non-member (404, no leak)', async () => {
    const { app } = makeApp();
    const id = await createScoped(app, 'TEAM', memberHeaders, { teamId: 'teamA' });
    // u3 is in org1 but on teamB, not teamA.
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: {
        'x-donna-user-id': 'u3',
        'x-donna-org-id': 'org1',
        'x-donna-role': 'team_member',
        'x-donna-actor-kind': 'agent',
        'x-donna-teams': 'teamB',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  // SEC-3a: PROJECT-scoped reads authorize members of the project, read from the
  // principal's projectIds (in dev via the x-donna-projects header; in
  // production from the project_memberships table).
  it('lets a project member read a PROJECT-scoped objective', async () => {
    const { app } = makeApp();
    // Owner u1 is a member of projP (required to create a PROJECT-scoped
    // objective there); the reader u4 is a different member of the same project.
    const ownerInProjP = { ...memberHeaders, 'x-donna-projects': 'projP' };
    const id = await createScoped(app, 'PROJECT', ownerInProjP, { projectId: 'projP' });
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: {
        'x-donna-user-id': 'u4',
        'x-donna-org-id': 'org1',
        'x-donna-role': 'team_member',
        'x-donna-actor-kind': 'agent',
        'x-donna-projects': 'projP',
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('hides a PROJECT-scoped objective from a same-org non-member (404, no leak)', async () => {
    const { app } = makeApp();
    const ownerInProjP = { ...memberHeaders, 'x-donna-projects': 'projP' };
    const id = await createScoped(app, 'PROJECT', ownerInProjP, { projectId: 'projP' });
    // u5 is in org1 but a member of a different project.
    const res = await app.inject({
      method: 'GET',
      url: `/objectives/${id}`,
      headers: {
        'x-donna-user-id': 'u5',
        'x-donna-org-id': 'org1',
        'x-donna-role': 'team_member',
        'x-donna-actor-kind': 'agent',
        'x-donna-projects': 'projOther',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  it('dispatches a task: creates it, enqueues a work order, emits task.created', async () => {
    const ctx = makeApp();
    const objectiveId = await createObjective(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/objectives/${objectiveId}/tasks`,
      headers: memberHeaders,
      payload: {
        goal: 'Summarize Route 40 launch',
        definitionOfDone: 'A one-paragraph summary',
        requiredCapabilities: ['reasoning'],
        needsReasoning: true,
        reasoningTier: 5,
        modelRequest: { messages: [{ role: 'user', content: 'summarize' }] },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('queued');
    expect(body.task.objectiveId).toBe(objectiveId);
    expect(body.jobId).toBe('mem-1');
    expect(ctx.publishedTypes).toContain('task.created');

    // The work order handed to the queue carries the created task and hints.
    expect(ctx.workQueue.enqueued).toHaveLength(1);
    const order = ctx.workQueue.enqueued[0];
    expect(order?.taskId).toBe(body.task.id);
    expect(order?.requiredCapabilities).toEqual(['reasoning']);
    expect(order?.needsReasoning).toBe(true);
    expect(order?.modelRequest?.messages[0]?.content).toBe('summarize');
  });

  it('rejects an unauthenticated dispatch', async () => {
    const ctx = makeApp();
    const objectiveId = await createObjective(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/objectives/${objectiveId}/tasks`,
      payload: { goal: 'x', definitionOfDone: 'y' },
    });
    expect(res.statusCode).toBe(401);
    expect(ctx.workQueue.enqueued).toHaveLength(0);
  });

  it('returns 404 dispatching under a missing objective', async () => {
    const ctx = makeApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/objectives/does-not-exist/tasks',
      headers: memberHeaders,
      payload: { goal: 'x', definitionOfDone: 'y' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('objective_not_found');
  });

  it('validates the dispatch body and never enqueues on a bad request', async () => {
    const ctx = makeApp();
    const objectiveId = await createObjective(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/objectives/${objectiveId}/tasks`,
      headers: memberHeaders,
      payload: { goal: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(ctx.workQueue.enqueued).toHaveLength(0);
  });
});
