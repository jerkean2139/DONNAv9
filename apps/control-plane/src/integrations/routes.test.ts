import { signIntegrationBody } from './signature.js';
import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@donna/events';
import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import type { IntegrationInbox } from './inbox.js';

function setup() {
  const received = new Set<string>();
  const inbox: IntegrationInbox = {
    async resolveSource(key, externalOrganizationId) {
      return key === 'kobteamllm' && externalOrganizationId === '7'
        ? { id: 'source-1', organizationId: 'donna-org-1' }
        : null;
    },
    async receive(_sourceId, _organizationId, event) {
      const duplicate = received.has(event.eventId);
      received.add(event.eventId);
      return { duplicate };
    },
  };
  const bus = new InMemoryEventBus();
  const app = buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    integrations: { inbox, sources: [{ key: 'kobteamllm', secret: 'secret' }] },
  });
  return app;
}

const event = {
  event_id: 'evt-1',
  schema_version: '1',
  event_type: 'task.updated',
  organization_id: '7',
  occurred_at: '2026-10-04T12:00:00.000Z',
  entity_type: 'task',
  external_entity_id: '42',
  correlation_id: 'corr-1',
  payload: { status: 'in_progress' },
};

function signed(rawBody: string, timestamp = new Date().toISOString()) {
  return {
    'content-type': 'application/json',
    'x-donna-source': 'kobteamllm',
    'x-donna-timestamp': timestamp,
    'x-donna-signature': signIntegrationBody('secret', timestamp, rawBody),
  };
}

describe('project manager integration inbox route', () => {
  it('accepts a valid signed event and acknowledges a duplicate harmlessly', async () => {
    const app = setup();
    const raw = JSON.stringify(event);
    const first = await app.inject({
      method: 'POST',
      url: '/internal/integrations/project-manager/v1/events',
      headers: signed(raw),
      payload: raw,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ accepted: true, duplicate: false });

    const second = await app.inject({
      method: 'POST',
      url: '/internal/integrations/project-manager/v1/events',
      headers: signed(raw),
      payload: raw,
    });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ accepted: true, duplicate: true });
  });

  it('rejects a bad signature', async () => {
    const app = setup();
    const raw = JSON.stringify(event);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/integrations/project-manager/v1/events',
      headers: { ...signed(raw), 'x-donna-signature': 'sha256=bad' },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a replay outside the five minute window', async () => {
    const app = setup();
    const raw = JSON.stringify(event);
    const timestamp = '2020-01-01T00:00:00.000Z';
    const res = await app.inject({
      method: 'POST',
      url: '/internal/integrations/project-manager/v1/events',
      headers: signed(raw, timestamp),
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unmapped external organization', async () => {
    const app = setup();
    const wrong = { ...event, organization_id: '999', event_id: 'evt-2' };
    const raw = JSON.stringify(wrong);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/integrations/project-manager/v1/events',
      headers: signed(raw),
      payload: raw,
    });
    expect(res.statusCode).toBe(403);
  });
});
