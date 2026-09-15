import { describe, expect, it } from 'vitest';

import type { ErrorClass, HealthReport } from './contracts.js';
import { isRetryable, worstHealth } from './health.js';

describe('worstHealth', () => {
  it('returns healthy when all healthy', () => {
    const reports: HealthReport[] = [{ status: 'healthy' }, { status: 'healthy' }];
    expect(worstHealth(reports)).toBe('healthy');
  });

  it('returns the worst status present', () => {
    expect(worstHealth([{ status: 'healthy' }, { status: 'degraded' }])).toBe('degraded');
    expect(worstHealth([{ status: 'degraded' }, { status: 'offline' }])).toBe('offline');
  });

  it('treats an empty list as healthy', () => {
    expect(worstHealth([])).toBe('healthy');
  });
});

describe('isRetryable', () => {
  it('retries transient-class failures', () => {
    for (const cls of ['transient', 'rate_limit', 'unavailable'] as ErrorClass[]) {
      expect(isRetryable(cls)).toBe(true);
    }
  });

  it('does not retry deterministic or auth failures', () => {
    for (const cls of ['deterministic', 'auth', 'unknown'] as ErrorClass[]) {
      expect(isRetryable(cls)).toBe(false);
    }
  });
});
