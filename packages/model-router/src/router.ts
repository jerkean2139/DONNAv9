import type { ModelEntry, ModelProvider } from '@donna/config';

export type ModelHealth = 'healthy' | 'degraded' | 'unhealthy';

export interface ModelRuntimeSignals {
  /** Empirical first-pass acceptance rate, 0..1. Preferred when available. */
  readonly acceptanceRate?: number;
  /** Empirical quality score, 0..1, used when acceptance rate is unavailable. */
  readonly qualityScore?: number;
  /** Observed or estimated end-to-end latency for this model. */
  readonly expectedLatencyMs?: number;
  /** Runtime health signal. Unhealthy models are never eligible. */
  readonly health?: ModelHealth;
}

/**
 * Model Router (Technical Plan §10, Build Bible V2 doc 12). Invoked ONLY after
 * the Work Router decides AI is the right execution class.
 *
 * AI-1 keeps eligibility deterministic, then ranks the remaining candidates by
 * required quality first and expected cost per accepted result second. Runtime
 * health and latency are explicit inputs. No LLM is used to choose another LLM.
 */
export interface ModelRoutingInput {
  /** 0-10 reasoning tier from the task (Technical Plan §10). */
  readonly reasoningTier: number;
  /** 0-10 independent execution risk. Higher risk raises the quality floor. */
  readonly riskLevel?: number;
  /** Explicit minimum predicted first-pass quality/acceptance, 0..1. */
  readonly minQuality?: number;
  readonly needsTools?: boolean;
  readonly needsVision?: boolean;
  /** Privacy: the work must run on a local node (Technical Plan §9). */
  readonly requireLocal?: boolean;
  /** RESTRICTED is local-only. CONFIDENTIAL prefers local when quality is sufficient. */
  readonly dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  readonly minContextTokens?: number;
  /** Optional request-size estimate for cost-per-accepted-result scoring. */
  readonly expectedInputTokens?: number;
  readonly expectedOutputTokens?: number;
  /** Hard latency ceiling when a runtime latency signal is known. */
  readonly maxLatencyMs?: number;
  /** Runtime telemetry keyed by model id. */
  readonly runtimeSignals?: Readonly<Record<string, ModelRuntimeSignals>>;
  /** Providers to exclude (e.g. one is down — the orchestrator's fallback step). */
  readonly excludeProviders?: readonly ModelProvider[];
  /** Fail closed when no candidate reaches the quality floor. Defaults false. */
  readonly strictQuality?: boolean;
}

export interface ModelCandidateScore {
  readonly model: ModelEntry;
  readonly predictedQuality: number;
  readonly requiredQuality: number;
  readonly meetsQualityFloor: boolean;
  readonly expectedCostUsd: number;
  readonly expectedCostPerAcceptedResultUsd: number;
  readonly expectedLatencyMs?: number;
  readonly health: ModelHealth;
}

export interface ModelRoutingDecision {
  readonly model: ModelEntry;
  /** Ordered escalation/fallback chain if the primary fails or is unavailable. */
  readonly fallbacks: readonly ModelEntry[];
  readonly reason: string;
  /** Explainable, deterministic candidate ranking for audit/debugging. */
  readonly candidates: readonly ModelCandidateScore[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requiredQuality(input: ModelRoutingInput): number {
  const risk = clamp(input.riskLevel ?? 0, 0, 10);
  const riskFloor = 0.7 + risk * 0.02;
  return clamp(Math.max(input.minQuality ?? 0, riskFloor), 0, 0.99);
}

function predictedQuality(
  model: ModelEntry,
  input: ModelRoutingInput,
  signals: ModelRuntimeSignals,
): number {
  const empirical = signals.acceptanceRate ?? signals.qualityScore;
  if (empirical !== undefined) return clamp(empirical, 0.01, 0.99);

  const tier = input.reasoningTier;
  const [minTier, maxTier] = model.tierRange;

  if (tier < minTier) return 0.95;
  if (tier > maxTier) return 0.01;

  const span = Math.max(1, maxTier - minTier);
  const headroom = clamp((maxTier - tier) / span, 0, 1);
  return clamp(0.75 + headroom * 0.2, 0.01, 0.99);
}

function expectedCostUsd(model: ModelEntry, input: ModelRoutingInput): number {
  const inputTokens = Math.max(0, input.expectedInputTokens ?? 1000);
  const outputTokens = Math.max(0, input.expectedOutputTokens ?? 500);

  return (
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M
  );
}

function signalFor(model: ModelEntry, input: ModelRoutingInput): ModelRuntimeSignals {
  return input.runtimeSignals?.[model.id] ?? {};
}

function isEligible(model: ModelEntry, input: ModelRoutingInput): boolean {
  if (!model.available) return false;

  const signals = signalFor(model, input);
  if (signals.health === 'unhealthy') return false;
  if (input.needsTools === true && !model.capabilities.tools) return false;
  if (input.needsVision === true && !model.capabilities.vision) return false;

  const localRequired =
    input.requireLocal === true || input.dataClassification === 'RESTRICTED';
  if (localRequired && model.privacy !== 'local') return false;

  if (model.contextTokens < (input.minContextTokens ?? 0)) return false;
  if (input.excludeProviders?.includes(model.provider) === true) return false;

  if (
    input.maxLatencyMs !== undefined &&
    signals.expectedLatencyMs !== undefined &&
    signals.expectedLatencyMs > input.maxLatencyMs
  ) {
    return false;
  }

  return model.tierRange[1] >= input.reasoningTier;
}

function scoreCandidate(model: ModelEntry, input: ModelRoutingInput): ModelCandidateScore {
  const signals = signalFor(model, input);
  const quality = predictedQuality(model, input, signals);
  const floor = requiredQuality(input);
  const cost = expectedCostUsd(model, input);

  return {
    model,
    predictedQuality: quality,
    requiredQuality: floor,
    meetsQualityFloor: quality >= floor,
    expectedCostUsd: cost,
    expectedCostPerAcceptedResultUsd: cost / quality,
    ...(signals.expectedLatencyMs !== undefined
      ? { expectedLatencyMs: signals.expectedLatencyMs }
      : {}),
    health: signals.health ?? 'healthy',
  };
}

function compareCandidates(
  a: ModelCandidateScore,
  b: ModelCandidateScore,
  input: ModelRoutingInput,
): number {
  if (a.meetsQualityFloor !== b.meetsQualityFloor) {
    return a.meetsQualityFloor ? -1 : 1;
  }

  if (!a.meetsQualityFloor && !b.meetsQualityFloor) {
    const qualityDiff = b.predictedQuality - a.predictedQuality;
    if (qualityDiff !== 0) return qualityDiff;
  }

  if (input.dataClassification === 'CONFIDENTIAL' && a.model.privacy !== b.model.privacy) {
    return a.model.privacy === 'local' ? -1 : 1;
  }

  if (a.health !== b.health) {
    if (a.health === 'healthy') return -1;
    if (b.health === 'healthy') return 1;
  }

  const cpaDiff =
    a.expectedCostPerAcceptedResultUsd - b.expectedCostPerAcceptedResultUsd;
  if (cpaDiff !== 0) return cpaDiff;

  const aLatency = a.expectedLatencyMs ?? Number.POSITIVE_INFINITY;
  const bLatency = b.expectedLatencyMs ?? Number.POSITIVE_INFINITY;
  if (aLatency !== bLatency) return aLatency - bLatency;

  return (
    a.model.outputCostPer1M - b.model.outputCostPer1M ||
    a.model.inputCostPer1M - b.model.inputCostPer1M
  );
}

/**
 * Deterministic Maximum Logic Router core.
 *
 * 1. Apply hard capability/privacy/health/context/provider/latency eligibility.
 * 2. Prefer models whose configured tier range covers the requested reasoning tier.
 * 3. Apply a risk-adjusted quality floor.
 * 4. Rank acceptable candidates by expected cost per accepted result.
 * 5. If no covering model reaches the quality floor, expand to overqualified
 *    capable models before accepting a below-floor route.
 */
export function routeModel(
  input: ModelRoutingInput,
  registry: readonly ModelEntry[],
): ModelRoutingDecision | null {
  const eligible = registry.filter((model) => isEligible(model, input));
  if (eligible.length === 0) return null;

  const tier = input.reasoningTier;
  const covering = eligible.filter(
    (model) => model.tierRange[0] <= tier && tier <= model.tierRange[1],
  );

  const coveringScores = covering.map((model) => scoreCandidate(model, input));
  const coveringMeetsFloor = coveringScores.some((candidate) => candidate.meetsQualityFloor);

  let candidateModels: readonly ModelEntry[];
  let expansionReason: string;

  if (covering.length === 0) {
    candidateModels = eligible;
    expansionReason = 'No model tier directly covers the request; using capable overqualified models.';
  } else if (coveringMeetsFloor) {
    candidateModels = covering;
    expansionReason = 'At least one tier-covering model meets the quality floor.';
  } else {
    candidateModels = eligible;
    expansionReason =
      'No tier-covering model meets the quality floor; expanded to all capable models.';
  }

  const ranked = candidateModels
    .map((model) => scoreCandidate(model, input))
    .sort((a, b) => compareCandidates(a, b, input));

  const primary = ranked[0];
  if (primary === undefined) return null;
  if (input.strictQuality === true && !primary.meetsQualityFloor) return null;

  const reason =
    `${expansionReason} Selected ${primary.model.id}: predicted quality ${primary.predictedQuality.toFixed(
      3,
    )} vs required ${primary.requiredQuality.toFixed(3)}, expected cost/accepted result $${primary.expectedCostPerAcceptedResultUsd.toFixed(
      6,
    )}.`;

  return {
    model: primary.model,
    fallbacks: ranked.slice(1).map((candidate) => candidate.model),
    reason,
    candidates: ranked,
  };
}
