import type {
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  HealthReport,
  ModelAdapter,
  ModelCapabilities,
  ModelRequest,
  ModelResult,
  UsageRecord,
} from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import { OpenAiModelAdapter, type OpenAiChatClient } from '@donna/adapter-openai';

export interface LocalAdapterOptions {
  /** The registry entry this adapter is bound to (a `privacy: 'local'` model). */
  readonly model: ModelEntry;
  /** The local OpenAI-compatible endpoint, e.g. `http://127.0.0.1:11434/v1`. Required. */
  readonly baseURL: string;
  /**
   * API key for the local server. Most self-hosted servers ignore it but the
   * SDK still requires a non-empty value, so it defaults to a placeholder.
   */
  readonly apiKey?: string;
  /** Injected client for tests; defaults to a real SDK client bound to `baseURL`. */
  readonly client?: OpenAiChatClient;
  readonly defaultMaxOutputTokens?: number;
  readonly reasoningEffort?: boolean;
}

/**
 * Local (self-hosted) {@link ModelAdapter}. A local model runs behind an
 * OpenAI-compatible server (Ollama / vLLM / LM Studio), so this reuses
 * {@link OpenAiModelAdapter} pointed at the local endpoint — the same way
 * `@donna/adapter-ghl` composes the HTTP adapter — rather than duplicating the
 * SDK integration. The distinction the rest of the system sees is the `local:`
 * id prefix and the `privacy: 'local'` registry entry, which the Model Router
 * uses for privacy-constrained routing (Technical Plan §9/§10).
 *
 * The endpoint URL comes from the environment / composition root, never source
 * (§8); no cloud key is involved.
 */
export class LocalModelAdapter implements ModelAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = '1';

  private readonly openai: OpenAiModelAdapter;

  constructor(options: LocalAdapterOptions) {
    this.openai = new OpenAiModelAdapter({
      model: options.model,
      baseURL: options.baseURL,
      apiKey: options.apiKey ?? 'local',
      idPrefix: 'local',
      namePrefix: 'Local',
      ...(options.client !== undefined ? { client: options.client } : {}),
      ...(options.defaultMaxOutputTokens !== undefined
        ? { defaultMaxOutputTokens: options.defaultMaxOutputTokens }
        : {}),
      ...(options.reasoningEffort !== undefined
        ? { reasoningEffort: options.reasoningEffort }
        : {}),
    });
    this.id = this.openai.id;
    this.name = this.openai.name;
  }

  capabilities(): CapabilitySpec {
    return this.openai.capabilities();
  }

  modelCapabilities(): ModelCapabilities {
    return this.openai.modelCapabilities();
  }

  health(): Promise<HealthReport> {
    return this.openai.health();
  }

  estimate(input: ModelRequest): Promise<CostEstimate> {
    return this.openai.estimate(input);
  }

  execute(input: ModelRequest): Promise<ModelResult> {
    return this.openai.execute(input);
  }

  reportUsage(): UsageRecord | undefined {
    return this.openai.reportUsage();
  }

  classifyError(error: unknown): ErrorClass {
    return this.openai.classifyError(error);
  }
}
