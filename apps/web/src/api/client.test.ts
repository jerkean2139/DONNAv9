import { describe, expect, it, vi } from 'vitest';

import { ControlPlaneClient } from './client';

type FetchCall = [string, RequestInit | undefined];

describe('ControlPlaneClient', () => {
  it('health() GETs /health', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    const client = new ControlPlaneClient({
      baseUrl: 'http://api.test/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.health();

    expect(res.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith('http://api.test/health');
  });

  it('createObjective POSTs with principal headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'o1', requestedOutcome: 'x', status: 'draft' }),
    });
    const client = new ControlPlaneClient({
      baseUrl: 'http://api.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      principalHeaders: { 'x-donna-user-id': 'u1' },
    });

    const obj = await client.createObjective({ requestedOutcome: 'x', definitionOfDone: 'y' });

    expect(obj.id).toBe('o1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as FetchCall;
    expect(url).toBe('http://api.test/objectives');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['x-donna-user-id']).toBe('u1');
  });

  it('throws forbidden on 403', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const client = new ControlPlaneClient({
      baseUrl: 'http://api.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.createObjective({ requestedOutcome: 'x', definitionOfDone: 'y' }),
    ).rejects.toThrow('forbidden');
  });
});
