import type { HttpFetch, HttpFetchResponse } from '@donna/adapter-http';
import { describe, expect, it } from 'vitest';

import { GhlCapabilityAdapter, GhlConfigError, toHttpRequest } from './ghl-adapter.js';

function fakeResponse(status: number, body: string): HttpFetchResponse {
  const headers = new Map([['content-type', 'application/json']]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headers.get(name.toLowerCase()) ?? null,
      forEach: (cb) => headers.forEach((value, key) => cb(value, key)),
    },
    text: () => Promise.resolve(body),
  };
}

interface Call {
  url: string;
  init: Parameters<HttpFetch>[1];
}
function recordingFetch(response: HttpFetchResponse): { fetch: HttpFetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(response);
    },
  };
}

describe('toHttpRequest', () => {
  it('maps contact.upsert to POST /contacts/upsert with the location id', () => {
    const req = toHttpRequest(
      { op: 'contact.upsert', contact: { email: 'a@b.com', firstName: 'A' } },
      'loc1',
    );
    expect(req).toEqual({
      path: '/contacts/upsert',
      method: 'POST',
      body: { locationId: 'loc1', email: 'a@b.com', firstName: 'A' },
    });
  });

  it('lets a request override the default location id', () => {
    const req = toHttpRequest(
      { op: 'contact.upsert', contact: { email: 'a@b.com', locationId: 'other' } },
      'loc1',
    );
    expect((req.body as { locationId: string }).locationId).toBe('other');
  });

  it('maps contact.get to GET /contacts/:id (encoded)', () => {
    expect(toHttpRequest({ op: 'contact.get', contactId: 'c/1' })).toEqual({
      path: '/contacts/c%2F1',
      method: 'GET',
    });
  });

  it('maps contact.search to POST /contacts/search with pageLimit', () => {
    expect(toHttpRequest({ op: 'contact.search', query: 'jane', limit: 5 }, 'loc1')).toEqual({
      path: '/contacts/search',
      method: 'POST',
      body: { locationId: 'loc1', query: 'jane', pageLimit: 5 },
    });
  });

  it('maps message.send to POST /conversations/messages', () => {
    expect(
      toHttpRequest({ op: 'message.send', contactId: 'c1', type: 'SMS', message: 'hi' }),
    ).toEqual({
      path: '/conversations/messages',
      method: 'POST',
      body: { type: 'SMS', contactId: 'c1', message: 'hi' },
    });
  });

  it('requires a location id for upsert and search', () => {
    expect(() => toHttpRequest({ op: 'contact.upsert', contact: { email: 'a@b.com' } })).toThrow(
      GhlConfigError,
    );
    expect(() => toHttpRequest({ op: 'contact.search' })).toThrow(GhlConfigError);
  });
});

describe('GhlCapabilityAdapter', () => {
  const opts = { token: 'tok-123', locationId: 'loc1' };

  it('issues the correct authenticated GHL request and maps the result', async () => {
    const { fetch, calls } = recordingFetch(
      fakeResponse(201, JSON.stringify({ contact: { id: 'c9' } })),
    );
    const adapter = new GhlCapabilityAdapter({ ...opts, fetchImpl: fetch });

    const result = await adapter.execute(
      { op: 'contact.upsert', contact: { email: 'a@b.com' } },
      { idempotencyKey: 'k1' },
    );

    expect(calls[0]?.url).toBe('https://services.leadconnectorhq.com/contacts/upsert');
    const init = calls[0]!.init;
    expect(init.method).toBe('POST');
    expect(init.headers['authorization']).toBe('Bearer tok-123');
    expect(init.headers['version']).toBe('2021-07-28');
    expect(init.headers['accept']).toBe('application/json');
    expect(init.headers['idempotency-key']).toBe('k1');
    expect(JSON.parse(init.body!)).toEqual({ locationId: 'loc1', email: 'a@b.com' });

    expect(result).toEqual({ op: 'contact.upsert', status: 201, data: { contact: { id: 'c9' } } });
    expect(adapter.capabilities().capabilities).toEqual(['crm', 'ghl']);
  });

  it('classifies a GHL 401 as auth (delegating to the HTTP taxonomy)', async () => {
    const { fetch } = recordingFetch(
      fakeResponse(401, JSON.stringify({ message: 'unauthorized' })),
    );
    const adapter = new GhlCapabilityAdapter({ ...opts, fetchImpl: fetch });
    let caught: unknown;
    await adapter
      .execute({ op: 'contact.get', contactId: 'c1' }, {})
      .catch((e: unknown) => (caught = e));
    expect(adapter.classifyError(caught)).toBe('auth');
  });

  it('classifies a missing-location config error as deterministic', async () => {
    const { fetch } = recordingFetch(fakeResponse(200, '{}'));
    const adapter = new GhlCapabilityAdapter({ token: 'tok', fetchImpl: fetch });
    await expect(
      adapter.execute({ op: 'contact.upsert', contact: { email: 'a@b.com' } }, {}),
    ).rejects.toBeInstanceOf(GhlConfigError);
    expect(adapter.classifyError(new GhlConfigError('x'))).toBe('deterministic');
  });
});
