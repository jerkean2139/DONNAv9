import type { ModelEntry } from '@donna/config';
import { describe, expect, it } from 'vitest';

import { routeModel } from './router.js';

function model(over: Partial<ModelEntry> & Pick<ModelEntry, 'id'>): ModelEntry {
  return {
    provider: 'anthropic',
    displayName: over.id,
    contextTokens: 200_000,
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    capabilities: { tools: true, vision: true, reasoning: true },
    tierRange: [0, 5],
    privacy: 'cloud',
    available: true,
    ...over,
  };
}

const cheap = model({ id: 'cheap', outputCostPer1M: 5, tierRange: [0, 4] });
const mid = model({ id: 'mid', outputCostPer1M: 10, tierRange: [3, 7] });
const dear = model({ id: 'dear', outputCostPer1M: 25, tierRange: [6, 9] });
const local = model({
  id: 'local',
  provider: 'local',
  privacy: 'local',
  outputCostPer1M: 0,
  tierRange: [0, 3],
  capabilities: { tools: false, vision: false, reasoning: false },
});

const registry = [cheap, mid, dear, local];

describe('routeModel', () => {
  it('picks the cheapest model covering the tier', () => {
    // tier 4: cheap [0,4] and (not mid [3,7]? yes covers) — cheapest covering is `cheap`
    expect(routeModel({ reasoningTier: 4 }, registry)?.model.id).toBe('cheap');
  });

  it('escalates to a capable model when none covers the tier band', () => {
    const d = routeModel({ reasoningTier: 8 }, [cheap, mid]);
    // neither covers 8; mid is capable (max 7)? no. So null.
    expect(d).toBeNull();
    const d2 = routeModel({ reasoningTier: 8 }, registry);
    expect(d2?.model.id).toBe('dear');
  });

  it('respects the required local privacy', () => {
    const d = routeModel({ reasoningTier: 2, requireLocal: true }, registry);
    expect(d?.model.id).toBe('local');
  });

  it('filters by capability (vision)', () => {
    // local has no vision; at tier 2 only local covers, so needing vision -> escalate to a cloud model
    const d = routeModel({ reasoningTier: 2, needsVision: true }, registry);
    expect(d?.model.capabilities.vision).toBe(true);
    expect(d?.model.id).not.toBe('local');
  });

  it('excludes down providers and returns a fallback chain', () => {
    const d = routeModel({ reasoningTier: 6, excludeProviders: ['local'] }, registry);
    expect(d?.model.id).toBe('mid'); // mid [3,7] covers 6, cheaper than dear
    expect(d?.fallbacks.map((m) => m.id)).toContain('dear');
  });

  it('returns null when nothing is eligible', () => {
    expect(routeModel({ reasoningTier: 2, minContextTokens: 10_000_000 }, registry)).toBeNull();
  });

  it('ignores unavailable models', () => {
    const down = model({ id: 'down', available: false, outputCostPer1M: 1, tierRange: [0, 9] });
    const d = routeModel({ reasoningTier: 4 }, [down, cheap]);
    expect(d?.model.id).toBe('cheap');
  });
});
