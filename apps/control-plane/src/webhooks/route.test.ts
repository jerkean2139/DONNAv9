import { InMemoryEventBus } from '@donna/events';
import { Webhook } from 'svix';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer, type ServerDeps } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import type { ClerkEvent } from './clerk-events.js';
import { WebhookVerificationError, type WebhookVerifier } from './clerk-verify.js';
import type { ProvisioningService } from './provisioning.js';

/** A verifier that returns the parsed body, or throws for a chosen bad signature. */
const stubVerifier: WebhookVerifier = {
  verify(rawBody) {
    if (rawBody.includes('BAD_SIG')) throw new WebhookVerificationError('bad signature');
    return JSON.parse(rawBody);
  },
};

function makeApp(over: Partial<ServerDeps['clerkWebhook']> = {}) {
  const bus = new InMemoryEventBus();
  const handled: ClerkEvent[] = [];
  const provisioning: ProvisioningService = {
    handle: (event) => {
      handled.push(event);
      return Promise.resolve({ handled: event.type !== 'unknown.event' });
    },
  };
  const app = buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    clerkWebhook: { verifier: stubVerifier, provisioning, ...over },
  });
  return { app, handled };
}

const headers = {
  'content-type': 'application/json',
  'svix-id': 'msg_1',
  'svix-timestamp': '1700000000',
  'svix-signature': 'v1,abc',
};

describe('POST /webhooks/clerk', () => {
  it('verifies, applies the event, and returns handled', async () => {
    const { app, handled } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers,
      payload: { type: 'user.updated', data: { id: 'user_1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: true });
    expect(handled[0]?.type).toBe('user.updated');
  });

  it('rejects a bad signature with 401 and never applies the event', async () => {
    const { app, handled } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers,
      payload: { type: 'user.updated', data: { id: 'BAD_SIG' } },
    });
    expect(res.statusCode).toBe(401);
    expect(handled).toHaveLength(0);
  });

  it('rejects a malformed (but signed) payload with 400', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers,
      payload: { data: { id: 'x' } }, // no type
    });
    expect(res.statusCode).toBe(400);
  });

  it('200s a no-op for an unknown event type (so Clerk does not retry)', async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/clerk',
      headers,
      payload: { type: 'unknown.event', data: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handled: false });
  });

  it('does not register the route when the webhook is not configured', async () => {
    const bus = new InMemoryEventBus();
    const app = buildServer({
      objectiveService: new InMemoryObjectiveService(bus),
      taskDispatcher: new InMemoryTaskDispatcher(
        new InMemoryTaskService(bus),
        new InMemoryWorkQueue(),
      ),
      authenticate: devAuthenticator(),
    });
    const res = await app.inject({ method: 'POST', url: '/webhooks/clerk', payload: {} });
    expect(res.statusCode).toBe(404);
  });
});

describe('SvixWebhookVerifier round-trip', () => {
  it('accepts a genuinely signed body and rejects a tampered one', async () => {
    const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const wh = new Webhook(secret);
    const body = JSON.stringify({ type: 'user.updated', data: { id: 'user_1' } });
    const id = 'msg_test';
    const timestamp = new Date();
    const signature = wh.sign(id, timestamp, body);
    const signed = {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    };
    // The real verifier accepts the genuine signature…
    expect(() => wh.verify(body, signed)).not.toThrow();
    // …and rejects a tampered body under the same signature.
    expect(() => wh.verify(body + ' ', signed)).toThrow(WebhookVerificationError);
  });
});
