import { describe, expect, it } from 'vitest';

import { FunctionCapabilityAdapter } from './function-adapter.js';

describe('FunctionCapabilityAdapter', () => {
  it('exposes its id and the capabilities it provides', () => {
    const adapter = new FunctionCapabilityAdapter({
      id: 'math.sum',
      provides: ['math'],
      handler: (input: number[]) => input.reduce((a, b) => a + b, 0),
    });
    const spec = adapter.capabilities();
    expect(spec.id).toBe('math.sum');
    expect(spec.capabilities).toEqual(['math']);
  });

  it('runs the handler and records usage', async () => {
    const adapter = new FunctionCapabilityAdapter({
      id: 'math.sum',
      provides: ['math'],
      handler: (input: number[]) => input.reduce((a, b) => a + b, 0),
      estimateUsd: 0.002,
    });
    const result = await adapter.execute([1, 2, 3], {});
    expect(result).toBe(6);
    const usage = adapter.reportUsage();
    expect(usage?.costUsd).toBe(0.002);
    expect(typeof usage?.latencyMs).toBe('number');
  });

  it('reports health and a deterministic estimate', async () => {
    const adapter = new FunctionCapabilityAdapter({ id: 'x', provides: [], handler: () => null });
    expect((await adapter.health()).status).toBe('healthy');
    const est = await adapter.estimate();
    expect(est.costUsd).toBe(0);
    expect(est.confidence).toBe(1);
  });

  it('classifies a thrown handler error as deterministic (non-retryable)', () => {
    const adapter = new FunctionCapabilityAdapter({ id: 'x', provides: [], handler: () => null });
    expect(adapter.classifyError(new Error('boom'))).toBe('deterministic');
  });
});
