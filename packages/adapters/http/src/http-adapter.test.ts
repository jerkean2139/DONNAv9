import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HttpCapabilityAdapter,
  HttpInvalidTargetError,
  HttpRequestError,
  type HttpFetch,
  type HttpFetchResponse,
} from './http-adapter.js';

function fakeResponse(
  status: number,
  body: string,
  contentType = 'application/json',
): HttpFetchResponse {
  const headers = new Map([['content-type', contentType]]);
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

interface Captured {
  url: string;
  init: Parameters<HttpFetch>[1];
}

/** A fake fetch that records the call and returns a configured response. */
function recordingFetch(response: HttpFetchResponse): { fetch: HttpFetch; calls: Captured[] } {
  const calls: Captured[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(response);
    },
  };
}

const base = { id: 'crm.http', provides: ['crm'], baseUrl: 'https://api.example.com' } as const;

describe('HttpCapabilityAdapter (unit)', () => {
  it('performs a GET, parses JSON, and reports it as the capability spec', async () => {
    const { fetch, calls } = recordingFetch(fakeResponse(200, JSON.stringify({ hello: 'world' })));
    const adapter = new HttpCapabilityAdapter({ ...base, fetchImpl: fetch });

    const result = await adapter.execute({ path: '/ping', query: { q: 1 } }, {});
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ hello: 'world' });
    expect(calls[0]?.url).toBe('https://api.example.com/ping?q=1');
    expect(calls[0]?.init.method).toBe('GET');
    expect(adapter.capabilities().capabilities).toEqual(['crm']);
  });

  it('serializes an object body, sets content-type, and merges default headers', async () => {
    const { fetch, calls } = recordingFetch(fakeResponse(201, '{}'));
    const adapter = new HttpCapabilityAdapter({
      ...base,
      fetchImpl: fetch,
      defaultHeaders: { authorization: 'Bearer secret' },
    });

    await adapter.execute({ path: '/contacts', method: 'POST', body: { name: 'A' } }, {});
    const init = calls[0]!.init;
    expect(init.body).toBe('{"name":"A"}');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['authorization']).toBe('Bearer secret');
  });

  it('sends ctx.idempotencyKey as a header so retries do not duplicate effects', async () => {
    const { fetch, calls } = recordingFetch(fakeResponse(200, '{}'));
    const adapter = new HttpCapabilityAdapter({ ...base, fetchImpl: fetch });
    await adapter.execute({ path: '/x', method: 'POST', body: {} }, { idempotencyKey: 'idem-1' });
    expect(calls[0]?.init.headers['idempotency-key']).toBe('idem-1');
  });

  it('throws HttpRequestError on a non-2xx and records usage', async () => {
    const { fetch } = recordingFetch(fakeResponse(404, JSON.stringify({ error: 'missing' })));
    const adapter = new HttpCapabilityAdapter({ ...base, fetchImpl: fetch });
    await expect(adapter.execute({ path: '/nope' }, {})).rejects.toBeInstanceOf(HttpRequestError);
    expect(adapter.reportUsage()?.details?.['status']).toBe(404);
  });

  it('maps HTTP status codes to the error taxonomy', async () => {
    const adapter = new HttpCapabilityAdapter({
      ...base,
      fetchImpl: recordingFetch(fakeResponse(200, '{}')).fetch,
    });
    const err = (status: number): HttpRequestError =>
      new HttpRequestError({ status, ok: false, headers: {}, body: null });
    expect(adapter.classifyError(err(429))).toBe('rate_limit');
    expect(adapter.classifyError(err(401))).toBe('auth');
    expect(adapter.classifyError(err(503))).toBe('unavailable');
    expect(adapter.classifyError(err(400))).toBe('deterministic');
    expect(adapter.classifyError(new Error('socket hang up'))).toBe('transient');
  });

  it('refuses a path that escapes the base origin (SSRF guard)', async () => {
    const { fetch } = recordingFetch(fakeResponse(200, '{}'));
    const adapter = new HttpCapabilityAdapter({ ...base, fetchImpl: fetch });
    await expect(adapter.execute({ path: 'https://evil.test/steal' }, {})).rejects.toBeInstanceOf(
      HttpInvalidTargetError,
    );
    expect(adapter.classifyError(new HttpInvalidTargetError('x'))).toBe('deterministic');
  });
});

describe('HttpCapabilityAdapter (real network)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url?.startsWith('/ok')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, url: req.url }));
        return;
      }
      if (req.url === '/echo' && req.method === 'POST') {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
          res.setHeader('content-type', 'application/json');
          res.setHeader('x-idem', (req.headers['idempotency-key'] as string) ?? '');
          res.end(data);
        });
        return;
      }
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'boom' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('makes a real GET and parses the response', async () => {
    const adapter = new HttpCapabilityAdapter({ ...base, baseUrl });
    const res = await adapter.execute({ path: '/ok', query: { a: 'b' } }, {});
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect((res.body as { url: string }).url).toBe('/ok?a=b');
  });

  it('POSTs a real body and propagates the idempotency key over the wire', async () => {
    const adapter = new HttpCapabilityAdapter({ ...base, baseUrl });
    const res = await adapter.execute(
      { path: '/echo', method: 'POST', body: { n: 7 } },
      { idempotencyKey: 'k-9' },
    );
    expect(res.body).toEqual({ n: 7 });
    expect(res.headers['x-idem']).toBe('k-9');
  });

  it('throws and classifies a real 500 as unavailable', async () => {
    const adapter = new HttpCapabilityAdapter({ ...base, baseUrl });
    let caught: unknown;
    await adapter.execute({ path: '/boom' }, {}).catch((e: unknown) => (caught = e));
    expect(caught).toBeInstanceOf(HttpRequestError);
    expect(adapter.classifyError(caught)).toBe('unavailable');
  });
});
