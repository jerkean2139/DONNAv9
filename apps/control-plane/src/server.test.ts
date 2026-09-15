import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { buildServer } from './server.js';
import { InMemoryObjectiveService } from './services/objective-service.js';

function makeApp() {
  const bus = new InMemoryEventBus();
  const publishedTypes: string[] = [];
  bus.subscribe('*', (e) => {
    publishedTypes.push(e.type);
  });
  const app = buildServer({ objectiveService: new InMemoryObjectiveService(bus) });
  return { app, publishedTypes };
}

const memberHeaders = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'agent',
  'x-donna-teams': 'teamA',
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

  it('returns 404 for a missing objective', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/objectives/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
