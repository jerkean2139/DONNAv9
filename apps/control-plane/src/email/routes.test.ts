import { randomBytes } from 'node:crypto';

import { GoogleOAuth } from '@donna/adapter-gmail';
import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it } from 'vitest';

import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import { InMemoryWorkService } from '../work/in-memory-work-service.js';
import { GmailService } from './gmail-service.js';
import { SecretBox } from './secret-box.js';
import { InMemoryConnectionStore, InMemoryEmailStore } from './stores.js';

const owner = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'owner',
  'x-donna-actor-kind': 'human',
};
const member = { ...owner, 'x-donna-user-id': 'u2', 'x-donna-role': 'team_member' };
const outsider = { ...owner, 'x-donna-user-id': 'u9', 'x-donna-org-id': 'org2' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const idToken = (email: string) =>
  `h.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.s`;

/** A fake Google: OAuth token endpoint plus the two Gmail calls. */
function fakeGoogle() {
  const calls: { url: string; body: string }[] = [];
  let gmailStatus = 200;
  const fetchImpl = async (url: string, init: RequestInit) => {
    const body = String(init.body ?? '');
    calls.push({ url, body });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const params = new URLSearchParams(body);
      if (params.get('grant_type') === 'authorization_code') {
        if (params.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' });
        return json(200, {
          access_token: 'access-1',
          refresh_token: 'rt-secret',
          expires_in: 3600,
          scope: 'openid email https://www.googleapis.com/auth/gmail.compose',
          id_token: idToken('me@acme.co'),
        });
      }
      return json(200, { access_token: 'access-2', expires_in: 3600 });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return json(200, {});
    if (gmailStatus !== 200) return json(gmailStatus, { error: { status: 'UNAUTHENTICATED' } });
    if (url.endsWith('/drafts')) return json(200, { id: 'draft-1', message: { id: 'm-1' } });
    if (url.endsWith('/messages/send')) return json(200, { id: 'm-2', threadId: 't-2' });
    return json(404, {});
  };
  return {
    fetchImpl,
    calls,
    gmailCalls: () => calls.filter((c) => c.url.includes('gmail.googleapis.com')),
    failGmail: (status: number) => {
      gmailStatus = status;
    },
  };
}

async function makeApp(configured = true) {
  const bus = new InMemoryEventBus();
  const work = new InMemoryWorkService();
  const google = fakeGoogle();
  const connections = new InMemoryConnectionStore();
  const gmail = new GmailService({
    connections,
    emails: new InMemoryEmailStore(),
    fetchImpl: google.fetchImpl,
    ...(configured
      ? {
          box: new SecretBox(randomBytes(32)),
          oauth: new GoogleOAuth({
            clientId: 'cid',
            clientSecret: 'csecret',
            redirectUri: 'https://donna.test/integrations/google/callback',
            fetchImpl: google.fetchImpl,
          }),
        }
      : {}),
  });
  const app = buildServer({
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    work,
    gmail,
  });
  const project = await work.createProject('org1', { name: 'Relaunch', clientId: null });
  const task = await work.createWorkItem(
    'org1',
    { projectId: project.id, title: 'Email Ana' },
    'u1',
  );
  return { app, google, connections, taskId: task.id };
}

type App = Awaited<ReturnType<typeof makeApp>>['app'];

async function connect(app: App, headers = owner) {
  const res = await app.inject({ method: 'POST', url: '/integrations/google/connect', headers });
  const state = new URL(res.json().url as string).searchParams.get('state') ?? '';
  return app.inject({
    method: 'GET',
    url: `/integrations/google/callback?code=good-code&state=${encodeURIComponent(state)}`,
  });
}

const message = { to: 'ana@acme.co', subject: 'Launch next steps', body: 'Hi Ana,\nReady?' };

describe('Gmail routes', () => {
  it('reports unconfigured when Google OAuth is not set up', async () => {
    const { app } = await makeApp(false);
    expect((await app.inject({ url: '/client-config' })).json()).toMatchObject({ gmail: false });
    const status = await app.inject({ url: '/integrations/google', headers: owner });
    expect(status.json()).toEqual({ configured: false, connected: false, email: null });
    const res = await app.inject({
      method: 'POST',
      url: '/integrations/google/connect',
      headers: owner,
    });
    expect(res.statusCode).toBe(503);
  });

  it('connects a Google account and stores the refresh token encrypted', async () => {
    const { app, connections } = await makeApp();
    expect((await app.inject({ url: '/client-config' })).json()).toMatchObject({ gmail: true });
    const start = await app.inject({
      method: 'POST',
      url: '/integrations/google/connect',
      headers: owner,
    });
    const url = new URL(start.json().url as string);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toContain('gmail.compose');

    const cb = await connect(app);
    expect(cb.statusCode).toBe(303);
    expect(cb.headers.location).toBe('/?gmail=connected');

    const status = await app.inject({ url: '/integrations/google', headers: owner });
    expect(status.json()).toEqual({ configured: true, connected: true, email: 'me@acme.co' });
    const stored = await connections.get('org1', 'u1');
    expect(stored?.refreshTokenEnc).toBeDefined();
    expect(stored?.refreshTokenEnc).not.toContain('rt-secret');
    // Connections are per person.
    const other = await app.inject({ url: '/integrations/google', headers: member });
    expect(other.json()).toMatchObject({ connected: false });
  });

  it('rejects a forged or missing state', async () => {
    const { app, connections } = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/integrations/google/callback?code=good-code&state=forged.state',
    });
    expect(res.headers.location).toBe('/?gmail=expired');
    expect(await connections.get('org1', 'u1')).toBeNull();
    const denied = await app.inject({
      method: 'GET',
      url: '/integrations/google/callback?error=access_denied',
    });
    expect(denied.headers.location).toBe('/?gmail=expired');
  });

  it('saves to Gmail drafts', async () => {
    const { app, google, taskId } = await makeApp();
    await connect(app);
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, mode: 'draft' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      mode: 'draft',
      status: 'done',
      gmailDraftId: 'draft-1',
      fromEmail: 'me@acme.co',
      to: ['ana@acme.co'],
    });
    expect(google.gmailCalls().map((c) => c.url)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    ]);
  });

  it('sends only with explicit confirmation, and records it', async () => {
    const { app, google, taskId } = await makeApp();
    await connect(app);
    const unconfirmed = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, mode: 'send' },
    });
    expect(unconfirmed.statusCode).toBe(409);
    expect(unconfirmed.json()).toEqual({ error: 'confirmation_required' });
    expect(google.gmailCalls()).toHaveLength(0);

    const sent = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, mode: 'send', confirm: true },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ mode: 'send', status: 'done' });
    expect(google.gmailCalls().map((c) => c.url)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    ]);

    const list = await app.inject({ url: `/tasks/${taskId}/emails`, headers: owner });
    expect(list.json().emails).toHaveLength(1);
  });

  it('lets a team member save drafts but not send', async () => {
    const { app, taskId } = await makeApp();
    await connect(app, member);
    const send = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: member,
      payload: { ...message, mode: 'send', confirm: true },
    });
    expect(send.statusCode).toBe(403);
    expect(send.json()).toEqual({ error: 'insufficient_authority' });
    const draft = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: member,
      payload: { ...message, mode: 'draft' },
    });
    expect(draft.statusCode).toBe(201);
  });

  it('validates the message and the connection', async () => {
    const { app, taskId } = await makeApp();
    const notConnected = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, mode: 'draft' },
    });
    expect(notConnected.json()).toEqual({ error: 'gmail_not_connected' });

    await connect(app);
    const bad = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, to: 'ana at acme', mode: 'draft' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_recipient' });
    const injected = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, subject: 'Hi\r\nBcc: x@evil.co', mode: 'draft' },
    });
    expect(injected.json()).toEqual({ error: 'invalid_subject' });
  });

  it('hides other tenants’ tasks', async () => {
    const { app, taskId } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: outsider,
      payload: { ...message, mode: 'draft' },
    });
    expect(res.statusCode).toBe(404);
    const list = await app.inject({ url: `/tasks/${taskId}/emails`, headers: outsider });
    expect(list.statusCode).toBe(404);
  });

  it('asks to reconnect when Google rejects the token, and records the failure', async () => {
    const { app, google, taskId } = await makeApp();
    await connect(app);
    google.failGmail(401);
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/email`,
      headers: owner,
      payload: { ...message, mode: 'send', confirm: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'gmail_reconnect' });
    const list = await app.inject({ url: `/tasks/${taskId}/emails`, headers: owner });
    expect(list.json().emails[0]).toMatchObject({ status: 'failed', error: 'UNAUTHENTICATED' });
  });

  it('disconnects and revokes', async () => {
    const { app, google } = await makeApp();
    await connect(app);
    const res = await app.inject({ method: 'DELETE', url: '/integrations/google', headers: owner });
    expect(res.statusCode).toBe(204);
    const status = await app.inject({ url: '/integrations/google', headers: owner });
    expect(status.json()).toMatchObject({ connected: false });
    const revoke = google.calls.find((c) => c.url.includes('/revoke'));
    expect(new URLSearchParams(revoke?.body).get('token')).toBe('rt-secret');
  });
});

describe('SecretBox', () => {
  const box = new SecretBox(randomBytes(32));

  it('round-trips and detects tampering', () => {
    const sealed = box.encrypt('refresh-token');
    expect(box.decrypt(sealed)).toBe('refresh-token');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    expect(() => new SecretBox(randomBytes(32)).decrypt(sealed)).toThrow();
  });

  it('signs expiring state', () => {
    const token = box.sign({ o: 'org1' }, 1000, 0);
    expect(box.verify(token, 500)).toMatchObject({ o: 'org1' });
    expect(box.verify(token, 1500)).toBeNull();
    expect(box.verify(`${token}x`, 500)).toBeNull();
  });

  it('parses keys from the environment', () => {
    expect(SecretBox.fromEnv(randomBytes(32).toString('base64'))).not.toBeNull();
    expect(SecretBox.fromEnv('short')).toBeNull();
    expect(SecretBox.fromEnv(undefined)).toBeNull();
  });
});
