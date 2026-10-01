import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import { InMemoryWorkService } from './in-memory-work-service.js';
import { MAX_UPLOAD_BYTES } from './routes.js';

function makeApp() {
  const bus = new InMemoryEventBus();
  return buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    work: new InMemoryWorkService(),
  });
}

type App = ReturnType<typeof makeApp>;

const member = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'human',
};
const outsider = { ...member, 'x-donna-user-id': 'u9', 'x-donna-org-id': 'org2' };

async function post(app: App, url: string, payload: unknown, headers = member) {
  return app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> });
}

async function seed(app: App) {
  const client = (await post(app, '/clients', { name: 'Acme Co' })).json();
  const project = (await post(app, '/projects', { name: 'Website', clientId: client.id })).json();
  const sprint = (await post(app, `/projects/${project.id}/sprints`, { name: 'Sprint 1' })).json();
  const task = (
    await post(app, `/projects/${project.id}/tasks`, { title: 'Homepage', sprintId: sprint.id })
  ).json();
  return { client, project, sprint, task };
}

describe('work hierarchy API', () => {
  it('requires authentication', async () => {
    const app = makeApp();
    expect((await app.inject({ method: 'GET', url: '/clients' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/clients', payload: { name: 'x' } })).statusCode,
    ).toBe(401);
  });

  it('creates and reads the full hierarchy', async () => {
    const app = makeApp();
    const { client, project, sprint, task } = await seed(app);
    const sub = await post(app, `/projects/${project.id}/tasks`, {
      title: 'Copy',
      parentId: task.id,
    });
    expect(sub.statusCode).toBe(201);

    const clients = (await app.inject({ method: 'GET', url: '/clients', headers: member })).json();
    expect(clients.clients).toMatchObject([{ id: client.id, name: 'Acme Co', projectCount: 1 }]);

    const clientDetail = (
      await app.inject({ method: 'GET', url: `/clients/${client.id}`, headers: member })
    ).json();
    expect(clientDetail.projects.map((p: { id: string }) => p.id)).toEqual([project.id]);

    const detail = (
      await app.inject({ method: 'GET', url: `/projects/${project.id}`, headers: member })
    ).json();
    expect(detail.client.id).toBe(client.id);
    expect(detail.sprints.map((s: { id: string }) => s.id)).toEqual([sprint.id]);
    expect(detail.tasks).toHaveLength(2);

    const taskDetail = (
      await app.inject({ method: 'GET', url: `/tasks/${task.id}`, headers: member })
    ).json();
    expect(taskDetail.subtasks.map((s: { title: string }) => s.title)).toEqual(['Copy']);
  });

  it('updates task status and lists open tasks across projects', async () => {
    const app = makeApp();
    const { task } = await seed(app);
    const patched = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      headers: member,
      payload: { status: 'in_progress' },
    });
    expect(patched.json().status).toBe('in_progress');
    const bad = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      headers: member,
      payload: { status: 'nope' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_status' });
    const open = (
      await app.inject({ method: 'GET', url: '/tasks?open=true', headers: member })
    ).json();
    expect(open.tasks).toHaveLength(1);
    expect(open.projects[0].name).toBe('Website');
  });

  it('reports hierarchy rule violations as 400 with a stable code', async () => {
    const app = makeApp();
    const { project, task } = await seed(app);
    const sub = (
      await post(app, `/projects/${project.id}/tasks`, { title: 'S', parentId: task.id })
    ).json();
    const res = await post(app, `/projects/${project.id}/tasks`, { title: 'x', parentId: sub.id });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'subtasks_are_one_level' });
    expect((await post(app, '/clients', { name: '' })).json()).toEqual({ error: 'name_required' });
  });

  it('isolates tenants: another org sees nothing and cannot write', async () => {
    const app = makeApp();
    const { client, project, task } = await seed(app);
    for (const url of [`/clients/${client.id}`, `/projects/${project.id}`, `/tasks/${task.id}`]) {
      expect((await app.inject({ method: 'GET', url, headers: outsider })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'GET', url: '/clients', headers: outsider })).json(),
    ).toEqual({
      clients: [],
    });
    expect(
      (await post(app, `/projects/${project.id}/tasks`, { title: 'x' }, outsider)).statusCode,
    ).toBe(404);
    const attach = await post(
      app,
      '/attachments',
      { targetType: 'task', targetId: task.id, url: 'https://example.com' },
      outsider,
    );
    expect(attach.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: `/tasks/${task.id}`, headers: outsider });
    expect(del.statusCode).toBe(404);
  });

  it('attaches Drive links and rejects unsafe URLs', async () => {
    const app = makeApp();
    const { client, sprint } = await seed(app);
    const link = await post(app, '/attachments', {
      targetType: 'client',
      targetId: client.id,
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
      title: 'Budget',
    });
    expect(link.statusCode).toBe(201);
    expect(link.json()).toMatchObject({ provider: 'google_sheets', title: 'Budget', kind: 'link' });
    const bad = await post(app, '/attachments', {
      targetType: 'sprint',
      targetId: sprint.id,
      url: 'javascript:alert(1)',
    });
    expect(bad.json()).toEqual({ error: 'invalid_url' });
    const list = await app.inject({
      method: 'GET',
      url: `/attachments?targetType=client&targetId=${client.id}`,
      headers: member,
    });
    expect(list.json().attachments).toHaveLength(1);
    expect(
      (
        await post(app, '/attachments', { targetType: 'nope', targetId: 'x', url: 'https://a.io' })
      ).json(),
    ).toEqual({ error: 'invalid_target_type' });
  });

  it('uploads and downloads files safely', async () => {
    const app = makeApp();
    const { task } = await seed(app);
    const upload = (name: string, type: string, body: Buffer) =>
      app.inject({
        method: 'POST',
        url: `/attachments/upload?targetType=task&targetId=${task.id}&filename=${encodeURIComponent(name)}`,
        headers: {
          ...member,
          'content-type': 'application/octet-stream',
          'x-attachment-type': type,
        },
        payload: body,
      });

    const png = await upload('shot.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.statusCode).toBe(201);
    expect(png.json()).toMatchObject({ kind: 'file', title: 'shot.png', sizeBytes: 4 });
    const get = await app.inject({
      method: 'GET',
      url: `/attachments/${png.json().id}/content`,
      headers: member,
    });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['content-disposition']).toMatch(/^inline/);
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.rawPayload).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    // Active content is never rendered inline from our origin.
    const html = await upload('evil.html', 'text/html', Buffer.from('<script>alert(1)</script>'));
    const htmlGet = await app.inject({
      method: 'GET',
      url: `/attachments/${html.json().id}/content`,
      headers: member,
    });
    expect(htmlGet.headers['content-disposition']).toMatch(/^attachment/);
    expect(htmlGet.headers['content-security-policy']).toContain('sandbox');

    // A JSON file is stored as bytes, not parsed as a request body.
    const json = await upload('data.json', 'application/json', Buffer.from('{"a":1}'));
    expect(json.statusCode).toBe(201);

    const outsiderGet = await app.inject({
      method: 'GET',
      url: `/attachments/${png.json().id}/content`,
      headers: outsider,
    });
    expect(outsiderGet.statusCode).toBe(404);

    const tooBig = await upload(
      'big.bin',
      'application/octet-stream',
      Buffer.alloc(MAX_UPLOAD_BYTES + 1),
    );
    expect(tooBig.statusCode).toBe(413);
  });

  it('deletes attachments and tasks', async () => {
    const app = makeApp();
    const { project, task } = await seed(app);
    const link = (
      await post(app, '/attachments', {
        targetType: 'task',
        targetId: task.id,
        url: 'https://a.io',
      })
    ).json();
    expect(
      (await app.inject({ method: 'DELETE', url: `/attachments/${link.id}`, headers: member }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `/tasks/${task.id}`, headers: member }))
        .statusCode,
    ).toBe(204);
    const detail = (
      await app.inject({ method: 'GET', url: `/projects/${project.id}`, headers: member })
    ).json();
    expect(detail.tasks).toEqual([]);
  });

  it('keeps the existing JSON API working alongside the upload parser', async () => {
    const app = makeApp();
    const res = await post(app, '/objectives', { requestedOutcome: 'x', definitionOfDone: 'y' });
    expect(res.statusCode).toBe(201);
  });
});
