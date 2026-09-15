/**
 * Model registry (Technical Plan §10/§11/§12). Model ids and pricing are
 * CONFIGURATION DATA, not hard-coded architecture (Build Bible V2 doc 12) — this
 * file is data the Model Router reads, and it is expected to change.
 *
 * The exact approved model pool and current pricing is an open question pending
 * Jeremy's confirmation (Technical Plan §22 item 7); the entries below are seed
 * values. Anthropic ids/prices are current as of 2026-06; OpenAI and local
 * entries are placeholders to confirm.
 */

export type ModelProvider = 'anthropic' | 'openai' | 'local';

/** Where inference runs, for privacy routing (Technical Plan §9/§10). */
export type ModelPrivacy = 'cloud' | 'local';

export interface ModelCapabilityFlags {
  readonly tools: boolean;
  readonly vision: boolean;
  readonly reasoning: boolean;
}

export interface ModelEntry {
  readonly id: string;
  readonly provider: ModelProvider;
  readonly displayName: string;
  readonly contextTokens: number;
  readonly inputCostPer1M: number;
  readonly outputCostPer1M: number;
  readonly cachedInputCostPer1M?: number;
  readonly capabilities: ModelCapabilityFlags;
  /** Reasoning tiers 0-10 this model is appropriate for (Technical Plan §10). */
  readonly tierRange: readonly [number, number];
  readonly privacy: ModelPrivacy;
  /** Whether the model is currently usable (provider up / node online). */
  readonly available: boolean;
}

const cloudCaps: ModelCapabilityFlags = { tools: true, vision: true, reasoning: true };

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  // --- Anthropic (ids/pricing current as of 2026-06; pricing is config data) ---
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    contextTokens: 200_000,
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    cachedInputCostPer1M: 0.1,
    capabilities: cloudCaps,
    tierRange: [0, 4],
    privacy: 'cloud',
    available: true,
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5',
    contextTokens: 1_000_000,
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
    cachedInputCostPer1M: 0.2,
    capabilities: cloudCaps,
    tierRange: [3, 7],
    privacy: 'cloud',
    available: true,
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5',
    contextTokens: 1_000_000,
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    cachedInputCostPer1M: 0.5,
    capabilities: cloudCaps,
    tierRange: [6, 9],
    privacy: 'cloud',
    available: true,
  },
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    displayName: 'Claude Fable 5.1',
    contextTokens: 1_000_000,
    inputCostPer1M: 10.0,
    outputCostPer1M: 50.0,
    cachedInputCostPer1M: 0.25,
    capabilities: cloudCaps,
    tierRange: [8, 10],
    privacy: 'cloud',
    available: true,
  },
  // --- OpenAI (placeholder ids/pricing — confirm per §22 item 7) ---
  {
    id: 'openai-frontier-placeholder',
    provider: 'openai',
    displayName: 'OpenAI frontier (placeholder)',
    contextTokens: 400_000,
    inputCostPer1M: 5.0,
    outputCostPer1M: 20.0,
    capabilities: cloudCaps,
    tierRange: [6, 9],
    privacy: 'cloud',
    available: false,
  },
  // --- Local (Dell/Omen, OpenAI-compatible; ids/models confirmed at setup) ---
  {
    id: 'local-small-placeholder',
    provider: 'local',
    displayName: 'Local small model (placeholder)',
    contextTokens: 32_000,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    capabilities: { tools: false, vision: false, reasoning: false },
    tierRange: [0, 3],
    privacy: 'local',
    available: false,
  },
];
