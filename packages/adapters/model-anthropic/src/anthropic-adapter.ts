import Anthropic from '@anthropic-ai/sdk';

import type {
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  HealthReport,
  ModelAdapter,
  ModelCapabilities,
  ModelMessage,
  ModelRequest,
  ModelResult,
  ModelUsage,
  UsageRecord,
} from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import { estimateCostUsd } from '@donna/cost-governor';

import type { AnthropicMessagesClient } from './client.js';

export interface AnthropicAdapterOptions {
  /** The registry entry this adapter is bound to (id, pricing, capabilities). */
  readonly model: ModelEntry;
  /** Injected client for tests; defaults to a real `new Anthropic()` (reads ANTHROPIC_API_KEY). */
  readonly client?: AnthropicMessagesClient;
  /** Enable adaptive thinking + effort (default: the model's reasoning capability). */
  readonly enableThinking?: boolean;
  readonly defaultMaxOutputTokens?: number;
}

/** Map a 0-10 reasoning tier to an Anthropic effort level (Technical Plan §10). */
export function effortForTier(tier: number): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (tier <= 2) return 'low';
  if (tier <= 5) return 'medium';
  if (tier <= 7) return 'high';
  if (tier <= 9) return 'xhigh';
  return 'max';
}

function approxTokens(messages: readonly ModelMessage[]): number {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(chars / 4);
}

/**
 * Anthropic (Claude) implementation of {@link ModelAdapter}. Business logic never
 * touches `@anthropic-ai/sdk` — only this adapter does (Technical Plan §7, the
 * provider-independence boundary). The API key comes from the environment /
 * secrets manager, never from source (§8).
 */
export class AnthropicModelAdapter implements ModelAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = '1';

  private readonly model: ModelEntry;
  private readonly client: AnthropicMessagesClient;
  private readonly enableThinking: boolean;
  private readonly defaultMaxOutputTokens: number;
  private lastUsage: UsageRecord | undefined;

  constructor(options: AnthropicAdapterOptions) {
    this.model = options.model;
    this.id = `anthropic:${options.model.id}`;
    this.name = `Anthropic ${options.model.displayName}`;
    this.client = options.client ?? (new Anthropic() as unknown as AnthropicMessagesClient);
    this.enableThinking = options.enableThinking ?? options.model.capabilities.reasoning;
    this.defaultMaxOutputTokens = options.defaultMaxOutputTokens ?? 16000;
  }

  capabilities(): CapabilitySpec {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      capabilities: ['model.generate', `model:${this.model.id}`],
    };
  }

  modelCapabilities(): ModelCapabilities {
    return {
      contextTokens: this.model.contextTokens,
      supportsTools: this.model.capabilities.tools,
      supportsVision: this.model.capabilities.vision,
      supportsStreaming: true,
      supportsReasoning: this.model.capabilities.reasoning,
    };
  }

  health(): Promise<HealthReport> {
    // A cheap liveness probe (models.retrieve) can be added later; optimistic by
    // default so routing doesn't drop the model without evidence it is down.
    return Promise.resolve({ status: 'healthy' });
  }

  estimate(input: ModelRequest): Promise<CostEstimate> {
    const inputTokens = approxTokens(input.messages);
    const outputTokens = input.maxOutputTokens ?? this.defaultMaxOutputTokens;
    return Promise.resolve({
      costUsd: estimateCostUsd(this.model, { inputTokens, outputTokens }),
      latencyMs: 0,
      confidence: 0.3,
    });
  }

  private buildParams(input: ModelRequest): Record<string, unknown> {
    const system = input.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const messages = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const params: Record<string, unknown> = {
      model: this.model.id,
      max_tokens: input.maxOutputTokens ?? this.defaultMaxOutputTokens,
      messages,
    };
    if (system !== '') params.system = system;
    if (this.enableThinking) {
      params.thinking = { type: 'adaptive' };
      params.output_config = { effort: effortForTier(input.reasoningTier ?? 5) };
    }
    return params;
  }

  async execute(input: ModelRequest): Promise<ModelResult> {
    const start = Date.now();
    const res = await this.client.messages.create(this.buildParams(input));
    const latencyMs = Date.now() - start;

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    const cachedInputTokens = res.usage.cache_read_input_tokens;
    const usage: ModelUsage = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      costUsd: estimateCostUsd(this.model, {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      }),
      latencyMs,
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    };
    this.lastUsage = {
      costUsd: usage.costUsd,
      latencyMs,
      details: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    };

    return { text, usage, finishReason: res.stop_reason ?? 'end_turn' };
  }

  reportUsage(): UsageRecord | undefined {
    return this.lastUsage;
  }

  classifyError(error: unknown): ErrorClass {
    if (error instanceof Anthropic.RateLimitError) return 'rate_limit';
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return 'auth';
    }
    if (
      error instanceof Anthropic.BadRequestError ||
      error instanceof Anthropic.NotFoundError ||
      error instanceof Anthropic.UnprocessableEntityError
    ) {
      return 'deterministic';
    }
    if (error instanceof Anthropic.InternalServerError) return 'unavailable';
    if (error instanceof Anthropic.APIConnectionError) return 'transient';
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      if (typeof status === 'number' && status >= 500) return 'unavailable';
      if (status === 429) return 'rate_limit';
      return 'deterministic';
    }
    return 'unknown';
  }
}
