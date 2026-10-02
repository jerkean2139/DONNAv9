import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import { InMemoryWorkService } from '../work/in-memory-work-service.js';
import { DEMO_CLIENT } from './demo-data.js';
import { seedDemo } from './seed.js';

function makeApp() {
  const bus = new InMemoryEventBus();
  const work = new InMemoryWorkService();
  const app = buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    work,
  });
  return { app, work };
}

const admin = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'admin',
  'x-donna-actor-kind': 'human',
};
const member = { ...admin, 'x-donna-user-id': 'u2', 'x-donna-role': 'team_member' };
const otherAdmin = { ...admin, 'x-donna-user-id': 'u9', 'x-donna-org-id': 'org2' };

const expected = {
  projects: DEMO_CLIENT.projects.length,
  sprints: DEMO_CLIENT.projects.reduce((n, p) => n + p.sprints.length, 0),
};

describe('demo data', () => {
  it('seeds the demo client with projects, dated sprints, tasks and subtasks', async () => {
    const { work } = makeApp();
    const counts = await seedDemo(work, 'org1', 'u1', new Date('2026-10-02T12:00:00Z'));
    expect(counts.projects).toBe(3);
    expect(counts.sprints).toBe(expected.sprints);
    expect(counts.subtasks).toBeGreaterThan(0);

    const [client] = await work.listClients('org1');
    const projects = await work.listProjects('org1', { clientId: client!.id });
    expect(projects.map((p) => p.name)).toContain('Visibility Program (Best)');

    const visibility = projects.find((p) => p.name.startsWith('Visibility'))!;
    const sprints = await work.listSprints('org1', visibility.id);
    expect(sprints.map((s) => s.status)).toEqual(['completed', 'active', 'planned', 'planned']);
    expect(sprints[1]).toMatchObject({ startsOn: '2026-09-25', endsOn: '2026-10-08' });

    const items = await work.listWorkItems('org1', { projectId: visibility.id });
    const calculator = items.find((i) => i.title.startsWith('Interactive roof cost calculator'))!;
    expect(calculator.sprintId).toBe(sprints[3]!.id);
    expect(items.filter((i) => i.parentId === calculator.id)).toHaveLength(2);
    expect(items.some((i) => i.owner === 'donna')).toBe(true);
    expect(items.some((i) => i.sprintId === null && i.parentId === null)).toBe(true);
  });

  it('lets an admin load and remove it, once, only in their own organization', async () => {
    const { app, work } = makeApp();
    const keep = await work.createClient('org1', { name: 'Real client', notes: 'Not a demo' });

    const first = await app.inject({ method: 'POST', url: '/demo', headers: admin });
    expect(first.statusCode).toBe(201);
    expect(first.json().seeded.projects).toBe(expected.projects);
    const again = await app.inject({ method: 'POST', url: '/demo', headers: admin });
    expect(again.statusCode).toBe(409);
    expect(await work.listClients('org2')).toEqual([]);

    // Another org's admin removes nothing here.
    const foreign = await app.inject({ method: 'DELETE', url: '/demo', headers: otherAdmin });
    expect(foreign.json().removedClients).toBe(0);
    expect(await work.listClients('org1')).toHaveLength(2);

    const removed = await app.inject({ method: 'DELETE', url: '/demo', headers: admin });
    expect(removed.json().removedClients).toBe(1);
    expect((await work.listClients('org1')).map((c) => c.id)).toEqual([keep.id]);
    expect(await work.listProjects('org1')).toEqual([]);
  });

  it('refuses team members and unauthenticated callers', async () => {
    const { app, work } = makeApp();
    const asMember = await app.inject({ method: 'POST', url: '/demo', headers: member });
    expect(asMember.statusCode).toBe(403);
    expect(asMember.json().error).toBe('admin_required');
    expect((await app.inject({ method: 'DELETE', url: '/demo', headers: member })).statusCode).toBe(
      403,
    );
    expect((await app.inject({ method: 'POST', url: '/demo' })).statusCode).toBe(401);
    expect(await work.listClients('org1')).toEqual([]);
  });
});
