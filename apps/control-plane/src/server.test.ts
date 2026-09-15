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
