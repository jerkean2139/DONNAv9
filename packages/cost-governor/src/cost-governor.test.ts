import type { ModelEntry } from '@donna/config';
import { describe, expect, it } from 'vitest';

import { checkBudget } from './budget.js';
import { estimateCostUsd } from './cost.js';
import { summarizeByModel, UsageLedger, type ModelEvaluation } from './ledger.js';

const model: ModelEntry = {
  id: 'm',
  provider: 'anthropic',
  displayName: 'M',
  contextTokens: 200_000,
  inputCostPer1M: 2,
  outputCostPer1M: 10,
  cachedInputCostPer1M: 0.2,
  capabilities: { tools: true, vision: true, reasoning: true },
  tierRange: [0, 7],
  privacy: 'cloud',
  available: true,
};

describe('estimateCostUsd', () => {
  it('prices uncached input, cached input, and output', () => {
    // 1M uncached input @ $2 + 0 cached + 1M output @ $10 = $12
    expect(estimateCostUsd(model, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(
      12,
    );
  });

  it('applies the cache-read rate to cached input', () => {
    // 1M input of which 1M cached @ $0.2 + 0 output = $0.2
    expect(
      estimateCostUsd(model, {
        inputTokens: 1_000_000,
        cachedInputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBeCloseTo(0.2);
  });
});

describe('checkBudget', () => {
  it('allows a spend within budget and denies one that exceeds it', () => {
    const budget = { scope: 'user' as const, scopeRef: 'u1', limitUsd: 10 };
    expect(checkBudget(budget, 4, 5).allowed).toBe(true);
    const over = checkBudget(budget, 8, 5);
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe('exceeds_budget');
    expect(over.remainingUsd).toBe(2);
  });
});

describe('UsageLedger', () => {
  it('totals spend with optional filtering', () => {
    const ledger = new UsageLedger();
    ledger.record({
      modelId: 'a',
      provider: 'anthropic',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 1,
      latencyMs: 10,
    });
    ledger.record({
      modelId: 'b',
      provider: 'openai',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 3,
      latencyMs: 10,
    });
    expect(ledger.totalUsd()).toBe(4);
    expect(ledger.totalUsd((r) => r.modelId === 'a')).toBe(1);
  });
});

describe('summarizeByModel', () => {
  it('computes acceptance rate, avg cost and avg quality per model', () => {
    const evals: ModelEvaluation[] = [
      {
        taskClass: 't',
        modelId: 'a',
        reasoningTier: 3,
        qualityScore: 0.8,
        accepted: true,
        corrected: false,
        costUsd: 1,
        latencyMs: 5,
      },
      {
        taskClass: 't',
        modelId: 'a',
        reasoningTier: 3,
        qualityScore: 0.6,
        accepted: false,
        corrected: true,
        costUsd: 3,
        latencyMs: 5,
      },
    ];
    const summary = summarizeByModel(evals).get('a')!;
    expect(summary.count).toBe(2);
    expect(summary.acceptanceRate).toBe(0.5);
    expect(summary.avgCostUsd).toBe(2);
    expect(summary.avgQuality).toBeCloseTo(0.7);
  });
});
