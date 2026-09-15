import type { ModelEntry, ModelProvider } from '@donna/config';

/**
 * Model Router (Technical Plan §10, Build Bible V2 doc 12). Invoked ONLY after
 * the Work Router decides AI is the right execution class. Selects the
 * lowest-cost model that reliably meets the required reasoning tier, capability,
 * privacy, context and availability constraints, and returns an ordered
 * fallback/escalation chain.
 */
export interface ModelRoutingInput {
  /** 0-10 reasoning tier from the task (Technical Plan §10). */
  readonly reasoningTier: number;
  readonly needsTools?: boolean;
  readonly needsVision?: boolean;
  /** Privacy: the work must run on a local node (Technical Plan §9). */
  readonly requireLocal?: boolean;
  readonly minContextTokens?: number;
  /** Providers to exclude (e.g. one is down — the orchestrator's fallback step). */
  readonly excludeProviders?: readonly ModelProvider[];
}

export interface ModelRoutingDecision {
  readonly model: ModelEntry;
  /** Ordered escalation/fallback chain if the primary fails or is unavailable. */
  readonly fallbacks: readonly ModelEntry[];
  readonly reason: string;
}

function isEligible(m: ModelEntry, input: ModelRoutingInput): boolean {
  if (!m.available) return false;
  if (input.needsTools === true && !m.capabilities.tools) return false;
  if (input.needsVision === true && !m.capabilities.vision) return false;
  if (input.requireLocal === true && m.privacy !== 'local') return false;
  if (m.contextTokens < (input.minContextTokens ?? 0)) return false;
  if (input.excludeProviders?.includes(m.provider) === true) return false;
  return true;
}

/** Cheaper output cost first; ties broken by cheaper input cost. */
function byCost(a: ModelEntry, b: ModelEntry): number {
  return a.outputCostPer1M - b.outputCostPer1M || a.inputCostPer1M - b.inputCostPer1M;
}

/**
 * Select a model for the request, or `null` if nothing eligible can meet the
 * tier. The primary is the cheapest model whose tier range covers the requested
 * tier; if none covers it exactly, escalate to the cheapest model capable of at
 * least that tier. Fallbacks are the remaining eligible models, cheapest first.
 */
export function routeModel(
  input: ModelRoutingInput,
  registry: readonly ModelEntry[],
): ModelRoutingDecision | null {
  const eligible = registry.filter((m) => isEligible(m, input));
  if (eligible.length === 0) return null;

  const tier = input.reasoningTier;
  const coversTier = eligible.filter((m) => m.tierRange[0] <= tier && tier <= m.tierRange[1]);
  const capableOfTier = eligible.filter((m) => m.tierRange[1] >= tier);

  const pool = coversTier.length > 0 ? coversTier : capableOfTier;
  if (pool.length === 0) return null;

  const ranked = [...pool].sort(byCost);
  const primary = ranked[0]!;
  const reason =
    coversTier.length > 0
      ? `Cheapest model covering tier ${tier}: ${primary.id}.`
      : `No model covers tier ${tier} exactly; escalated to cheapest capable model ${primary.id}.`;

  return { model: primary, fallbacks: ranked.slice(1), reason };
}
