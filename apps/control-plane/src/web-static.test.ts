import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from './auth/authenticate.js';
import { buildServer } from './server.js';
import { InMemoryObjectiveService } from './services/objective-service.js';
import { InMemoryTaskDispatcher } from './services/task-dispatcher.js';
import { InMemoryTaskService } from './services/task-service.js';
import { InMemoryWorkQueue } from './services/work-queue.js';

function makeApp(webRoot?: string) {
  const bus = new InMemoryEventBus();
  return buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    ...(webRoot !== undefined ? { webRoot } : {}),
  });
}

function makeWebRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'donna-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  return dir;
}

describe('web bundle serving', () => {
  it('serves index.html at / and static assets', async () => {
    const app = makeApp(makeWebRoot());
    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('id="root"');
    const asset = await app.inject({ method: 'GET', url: '/app.js' });
    expect(asset.statusCode).toBe(200);
  });

  it('falls back to index.html for browser navigations, JSON 404 otherwise', async () => {
    const app = makeApp(makeWebRoot());
    const nav = await app.inject({
      method: 'GET',
      url: '/today',
      headers: { accept: 'text/html' },
    });
    expect(nav.statusCode).toBe(200);
    expect(nav.body).toContain('id="root"');
    const api = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { accept: 'application/json' },
    });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });
  });

  it('keeps API routes ahead of the bundle', async () => {
    const app = makeApp(makeWebRoot());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('explains a missing bundle at / instead of a bare 404', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('bundle was not found');
  });
});
