import OpenAI, { APIError } from 'openai';

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
  ModelRole,
  ModelUsage,
  UsageRecord,
} from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import { estimateCostUsd } from '@donna/cost-governor';

import type { OpenAiChatClient } from './client.js';

export interface OpenAiAdapterOptions {
  /** The registry entry this adapter is bound to (id, pricing, capabilities). */
  readonly model: ModelEntry;
  /** Injected client for tests; defaults to a real `new OpenAI()`. */
  readonly client?: OpenAiChatClient;
  /** API key passed to the SDK; when omitted the SDK reads `OPENAI_API_KEY`. */
  readonly apiKey?: string;
  /** Override the endpoint — an OpenAI-compatible proxy or a local server. */
  readonly baseURL?: string;
  /** Adapter id / display prefixes (the local adapter reuses this with `local`). */
  readonly idPrefix?: string;
  readonly namePrefix?: string;
  readonly defaultMaxOutputTokens?: number;
  /**
   * Send `reasoning_effort` (default false). Off by default because plain chat
   * models and most OpenAI-compatible servers reject the field — only enable it
   * for a reasoning-capable model behind an endpoint that accepts it.
   */
  readonly reasoningEffort?: boolean;
}

/** Map a 0-10 reasoning tier to OpenAI's `reasoning_effort` levels. */
export function reasoningEffortForTier(tier: number): 'low' | 'medium' | 'high' {
  if (tier <= 3) return 'low';
  if (tier <= 7) return 'medium';
  return 'high';
}

/** OpenAI chat roles our simple message contract maps to (no tool calls yet). */
function toOpenAiRole(role: ModelRole): 'system' | 'user' | 'assistant' {
  if (role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  return 'user';
}

function approxTokens(messages: readonly ModelMessage[]): number {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(chars / 4);
}

/**
 * OpenAI implementation of {@link ModelAdapter}. Business logic never touches the
 * `openai` SDK — only this adapter does (Technical Plan §7, the
 * provider-independence boundary). The API key comes from the environment /
 * secrets manager, never from source (§8).
 *
 * Because it speaks the OpenAI Chat Completions contract, the same adapter drives
 * any OpenAI-compatible server via `baseURL`; {@link ModelEntry} `local` models
 * are wired through the thin `@donna/adapter-local` wrapper on top of this.
 */
export class OpenAiModelAdapter implements ModelAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = '1';

  private readonly model: ModelEntry;
  private readonly client: OpenAiChatClient;
  private readonly defaultMaxOutputTokens: number;
  private readonly reasoningEffort: boolean;
  private lastUsage: UsageRecord | undefined;

  constructor(options: OpenAiAdapterOptions) {
    this.model = options.model;
    this.id = `${options.idPrefix ?? 'openai'}:${options.model.id}`;
    this.name = `${options.namePrefix ?? 'OpenAI'} ${options.model.displayName}`;
    this.client =
      options.client ??
      (new OpenAI({
        ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
        ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
      }) as unknown as OpenAiChatClient);
    this.defaultMaxOutputTokens = options.defaultMaxOutputTokens ?? 16000;
    this.reasoningEffort = options.reasoningEffort ?? false;
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
    // Optimistic by default (matches the Anthropic adapter); a cheap liveness
    // probe can be added later so routing doesn't drop a model without evidence.
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
    const params: Record<string, unknown> = {
      model: this.model.id,
      messages: input.messages.map((m) => ({ role: toOpenAiRole(m.role), content: m.content })),
      max_tokens: input.maxOutputTokens ?? this.defaultMaxOutputTokens,
    };
    if (this.reasoningEffort) {
      params.reasoning_effort = reasoningEffortForTier(input.reasoningTier ?? 5);
    }
    return params;
  }

  async execute(input: ModelRequest): Promise<ModelResult> {
    const start = Date.now();
    const res = await this.client.chat.completions.create(this.buildParams(input));
    const latencyMs = Date.now() - start;

    const choice = res.choices[0];
    const text = choice?.message.content ?? '';

    const inputTokens = res.usage?.prompt_tokens ?? 0;
    const outputTokens = res.usage?.completion_tokens ?? 0;
    const cachedInputTokens = res.usage?.prompt_tokens_details?.cached_tokens;

    const usage: ModelUsage = {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(this.model, {
        inputTokens,
        outputTokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      }),
      latencyMs,
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    };
    this.lastUsage = {
      costUsd: usage.costUsd,
      latencyMs,
      details: { inputTokens, outputTokens },
    };

    return { text, usage, finishReason: choice?.finish_reason ?? 'stop' };
  }

  reportUsage(): UsageRecord | undefined {
    return this.lastUsage;
  }

  classifyError(error: unknown): ErrorClass {
    // Status-based classification keyed off the one stable SDK type (APIError).
    // A connection/timeout error is an APIError with no status → transient.
    if (error instanceof APIError) {
      const status = error.status;
      if (status === 429) return 'rate_limit';
      if (status === 401 || status === 403) return 'auth';
      if (typeof status === 'number' && status >= 500) return 'unavailable';
      if (typeof status === 'number' && status >= 400) return 'deterministic';
      return 'transient';
    }
    return 'unknown';
  }
}
