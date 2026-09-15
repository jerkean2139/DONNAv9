import type { ModelEntry } from '@donna/config';

/**
 * Cost estimation from token usage (Technical Plan §11). Cached input tokens are
 * billed at the model's cache-read rate when known.
 */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens: number;
}

export function estimateCostUsd(model: ModelEntry, usage: TokenUsage): number {
  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max(0, usage.inputTokens - cached);
  const cachedRate = model.cachedInputCostPer1M ?? model.inputCostPer1M;
  const inputCost = (uncachedInput * model.inputCostPer1M + cached * cachedRate) / 1_000_000;
  const outputCost = (usage.outputTokens * model.outputCostPer1M) / 1_000_000;
  return inputCost + outputCost;
}
