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

  it('raises the quality floor for high-risk work and chooses the stronger covering model', () => {
    const d = routeModel({ reasoningTier: 4, riskLevel: 10 }, registry);
    expect(d?.model.id).toBe('mid');
    expect(d?.candidates[0]?.meetsQualityFloor).toBe(true);
    expect(d?.candidates[0]?.requiredQuality).toBeCloseTo(0.9);
  });

  it('forces RESTRICTED data to local inference', () => {
    const d = routeModel({ reasoningTier: 2, dataClassification: 'RESTRICTED' }, registry);
    expect(d?.model.id).toBe('local');
    expect(d?.model.privacy).toBe('local');
  });

  it('prefers local for CONFIDENTIAL data when local quality is sufficient', () => {
    const d = routeModel({ reasoningTier: 2, dataClassification: 'CONFIDENTIAL' }, registry);
    expect(d?.model.id).toBe('local');
  });

  it('excludes unhealthy runtime models', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        runtimeSignals: {
          cheap: { health: 'unhealthy' },
        },
      },
      registry,
    );
    expect(d?.model.id).toBe('mid');
    expect(d?.candidates.map((candidate) => candidate.model.id)).not.toContain('cheap');
  });

  it('respects a hard latency ceiling when latency is known', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        maxLatencyMs: 1000,
        runtimeSignals: {
          cheap: { expectedLatencyMs: 5000 },
          mid: { expectedLatencyMs: 800 },
        },
      },
      registry,
    );
    expect(d?.model.id).toBe('mid');
  });

  it('preserves cheap-first selection under baseline-v1', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        routePolicyVersion: 'baseline-v1',
        runtimeSignals: {
          cheap: { acceptanceRate: 0.71 },
          mid: { acceptanceRate: 0.99 },
        },
      },
      registry,
    );
    expect(d?.model.id).toBe('cheap');
    expect(d?.reason).toContain('Baseline cheap-first policy');
  });

  it('uses Maximum Logic scoring when maximum-logic-v1 is selected', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        routePolicyVersion: 'maximum-logic-v1',
        minQuality: 0.95,
        runtimeSignals: {
          cheap: { acceptanceRate: 0.8 },
          mid: { acceptanceRate: 0.98 },
        },
      },
      registry,
    );
    expect(d?.model.id).toBe('mid');
    expect(d?.reason).toContain('Maximum Logic quality/risk/economics policy');
  });

  it('uses empirical acceptance rate for expected cost per accepted result', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        runtimeSignals: {
          cheap: { acceptanceRate: 0.71 },
          mid: { acceptanceRate: 0.98 },
        },
      },
      registry,
    );

    expect(d?.model.id).toBe('cheap');
    expect(d?.candidates[0]?.predictedQuality).toBeCloseTo(0.71);
    expect(d?.candidates[0]?.expectedCostPerAcceptedResultUsd).toBeGreaterThan(0);
  });

  it('expands to an overqualified model when covering models miss the quality floor', () => {
    const d = routeModel(
      {
        reasoningTier: 4,
        minQuality: 0.94,
        runtimeSignals: {
          cheap: { acceptanceRate: 0.7 },
          mid: { acceptanceRate: 0.8 },
          dear: { acceptanceRate: 0.97 },
        },
      },
      registry,
    );
    expect(d?.model.id).toBe('dear');
    expect(d?.reason).toContain('expanded to all capable models');
  });

  it('fails closed when strict quality is requested and nobody reaches the floor', () => {
    const d = routeModel(
      {
        reasoningTier: 8,
        minQuality: 0.99,
        strictQuality: true,
        runtimeSignals: {
          dear: { acceptanceRate: 0.8 },
        },
      },
      registry,
    );
    expect(d).toBeNull();
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
