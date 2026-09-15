import { describe, expect, it } from 'vitest';

import { isFeatureEnabled } from './feature-flags.js';
import { MODEL_REGISTRY } from './models.js';

describe('model registry', () => {
  it('has unique model ids', () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has well-formed tier ranges and non-negative pricing', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.tierRange[0]).toBeLessThanOrEqual(m.tierRange[1]);
      expect(m.tierRange[0]).toBeGreaterThanOrEqual(0);
      expect(m.tierRange[1]).toBeLessThanOrEqual(10);
      expect(m.inputCostPer1M).toBeGreaterThanOrEqual(0);
      expect(m.outputCostPer1M).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks local models as local privacy and cloud models as cloud', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.privacy).toBe(m.provider === 'local' ? 'local' : 'cloud');
    }
  });
});

describe('feature flags', () => {
  it('respects the enabled bit by default', () => {
    expect(isFeatureEnabled({ key: 'x', enabled: true })).toBe(true);
    expect(isFeatureEnabled({ key: 'x', enabled: false })).toBe(false);
  });

  it('allow-lists override a disabled flag', () => {
    const flag = { key: 'x', enabled: false, rollout: { allowUserIds: ['u1'] } };
    expect(isFeatureEnabled(flag, { userId: 'u1' })).toBe(true);
    expect(isFeatureEnabled(flag, { userId: 'u2' })).toBe(false);
  });

  it('allow-lists orgs too', () => {
    const flag = { key: 'x', enabled: false, rollout: { allowOrgIds: ['org1'] } };
    expect(isFeatureEnabled(flag, { organizationId: 'org1' })).toBe(true);
  });
});
