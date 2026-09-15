/**
 * Stable adapter contracts (Technical Plan §7, Build Bible doc 09).
 *
 * Product/business logic talks to these interfaces, never to a provider SDK.
 * Only packages under `packages/adapters/*` may import vendor SDKs (enforced by
 * the ESLint boundary rules), and they implement these contracts so any single
 * model/browser/memory provider stays replaceable (V2-007).
 */

export type HealthStatus = 'healthy' | 'degraded' | 'offline';

export interface HealthReport {
  readonly status: HealthStatus;
  readonly detail?: string;
}

/**
 * Normalized failure categories. The orchestrator decides retry/fallback from
 * these — fallback logic lives in one place, not scattered through adapters
 * (Technical Plan §7.5, Build Bible doc 09).
 */
export type ErrorClass =
  'transient' | 'rate_limit' | 'unavailable' | 'auth' | 'deterministic' | 'unknown';

export interface CostEstimate {
  readonly costUsd: number;
  readonly latencyMs: number;
  /** 0..1 confidence in the estimate. */
  readonly confidence: number;
}

export interface UsageRecord {
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly details?: Record<string, number>;
}

export interface CapabilitySpec {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Abstract capability names this adapter can satisfy (e.g. "lead.enrich"). */
  readonly capabilities: readonly string[];
}

/**
 * Minimum scoped context handed to an adapter for one execution. Adapters
 * receive only what the task needs; secrets stay in the secrets boundary and
 * are never copied into context or memory (Technical Plan §7.4/§8).
 */
export interface ExecutionContext {
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
}

/**
 * The base capability adapter. Every external execution engine — API,
 * automation, browser, coding agent, model — presents this shape.
 */
export interface CapabilityAdapter<TInput = unknown, TResult = unknown> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  capabilities(): CapabilitySpec;
  health(): Promise<HealthReport>;
  estimate(input: TInput, ctx: ExecutionContext): Promise<CostEstimate>;
  /** Must honor `ctx.idempotencyKey` so retries never duplicate side effects. */
  execute(input: TInput, ctx: ExecutionContext): Promise<TResult>;
  reportUsage(): UsageRecord | undefined;
  classifyError(error: unknown): ErrorClass;
  cancel?(idempotencyKey: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Model adapter (extends the base with model-specific normalization).
// ---------------------------------------------------------------------------

export interface ModelCapabilities {
  readonly contextTokens: number;
  readonly supportsTools: boolean;
  readonly supportsVision: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsReasoning: boolean;
}

export type ModelRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: string;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly maxOutputTokens?: number;
  /** 0..10 reasoning tier (Technical Plan §10); adapters map it to their controls. */
  readonly reasoningTier?: number;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number;
  readonly costUsd: number;
  readonly latencyMs: number;
}

export interface ModelResult {
  readonly text: string;
  readonly usage: ModelUsage;
  readonly finishReason: string;
}

/**
 * Model adapter. Business logic never encodes `if (provider === 'openai')` —
 * that lives only inside a concrete adapter (Technical Plan §7.2).
 */
export interface ModelAdapter extends CapabilityAdapter<ModelRequest, ModelResult> {
  modelCapabilities(): ModelCapabilities;
}
