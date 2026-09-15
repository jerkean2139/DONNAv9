import { describe, expect, it } from 'vitest';

import { CapabilityRegistry } from './registry.js';
import { candidateClasses, routeWork } from './router.js';

function registry(caps: Parameters<CapabilityRegistry['register']>[0][]): CapabilityRegistry {
  const r = new CapabilityRegistry();
  for (const c of caps) r.register(c);
  return r;
}

describe('routeWork', () => {
  it('routes to a human when the task requires judgment', () => {
    const d = routeWork({ requiredCapabilities: ['x'], prefersHuman: true }, registry([]));
    expect(d.executionClass).toBe('human');
    expect(d.reason).toBe('human_required');
  });

  it('prefers deterministic software over AI when both can do the work', () => {
    const r = registry([
      { id: 'ai', executionClass: 'cloud_ai', provides: ['summarize'], health: 'healthy' },
      { id: 'code', executionClass: 'deterministic', provides: ['summarize'], health: 'healthy' },
    ]);
    const d = routeWork({ requiredCapabilities: ['summarize'] }, r);
    expect(d.executionClass).toBe('deterministic');
    expect(d.capabilityId).toBe('code');
  });

  it('prefers local AI over cloud AI', () => {
    const r = registry([
      { id: 'cloud', executionClass: 'cloud_ai', provides: ['classify'], health: 'healthy' },
      { id: 'local', executionClass: 'local_ai', provides: ['classify'], health: 'healthy' },
    ]);
    expect(routeWork({ requiredCapabilities: ['classify'] }, r).capabilityId).toBe('local');
  });

  it('excludes unhealthy capabilities', () => {
    const r = registry([
      { id: 'code', executionClass: 'deterministic', provides: ['x'], health: 'offline' },
      { id: 'auto', executionClass: 'automation', provides: ['x'], health: 'healthy' },
    ]);
    expect(routeWork({ requiredCapabilities: ['x'] }, r).capabilityId).toBe('auto');
  });

  it('requires ALL capabilities to be satisfied by one provider', () => {
    const r = registry([
      { id: 'a', executionClass: 'deterministic', provides: ['x'], health: 'healthy' },
    ]);
    // needs x AND y; only x is provided -> no match -> reasoning fallback
    const d = routeWork({ requiredCapabilities: ['x', 'y'], needsReasoning: true }, r);
    expect(d.executionClass).toBe('cloud_ai');
    expect(d.reason).toBe('ai_reasoning_required');
  });

  it('falls back to AI when nothing matches and reasoning is needed', () => {
    const d = routeWork({ requiredCapabilities: ['novel'], needsReasoning: true }, registry([]));
    expect(d.executionClass).toBe('cloud_ai');
  });

  it('falls back to a human when nothing matches and no reasoning is needed', () => {
    const d = routeWork({ requiredCapabilities: ['novel'] }, registry([]));
    expect(d.executionClass).toBe('human');
    expect(d.reason).toBe('no_capability_fallback_human');
  });
});

describe('candidateClasses', () => {
  it('orders least-complex first and always ends at a human', () => {
    const r = registry([
      { id: 'ai', executionClass: 'cloud_ai', provides: ['t'], health: 'healthy' },
      { id: 'auto', executionClass: 'automation', provides: ['t'], health: 'healthy' },
    ]);
    expect(candidateClasses({ requiredCapabilities: ['t'], needsReasoning: true }, r)).toEqual([
      'automation',
      'cloud_ai',
      'human',
    ]);
  });

  it('deduplicates and keeps human as the final fallback', () => {
    expect(candidateClasses({ requiredCapabilities: ['none'] }, registry([]))).toEqual(['human']);
  });
});
