import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ProjectManagerReconciler } from './project-manager-reconciliation.js';

describe('ProjectManagerReconciler', () => {
  it('does not call the PM when no mapped sources exist', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const reconciler = new ProjectManagerReconciler(
      db as never,
      'https://pm.example.test',
      'secret',
    );
    await expect(reconciler.runAll()).resolves.toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('signs the exact GET path used by the PM contract', async () => {
    const timestamp = '2026-10-04T18:00:00.000Z';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    const path =
      '/api/integrations/donna/v1/changes?organization_id=42&entity_type=client&limit=100';
    const expected = `sha256=${createHmac('sha256', 'secret')
      .update(`${timestamp}.GET.${path}`)
      .digest('hex')}`;
    expect(expected).toMatch(/^sha256=[a-f0-9]{64}$/);
    vi.useRealTimers();
  });
});
