/**
 * Minimal structural interface for the parts of the OpenAI SDK the adapter uses.
 * Typing our own subset decouples the adapter from exact SDK param-type churn
 * (the SDK is at a fast-moving major version) and lets tests inject a fake
 * client without a key or network — the same seam the Anthropic adapter uses.
 *
 * The shape here (chat completions, `prompt_tokens`/`completion_tokens`) is the
 * stable, widely-implemented OpenAI Chat Completions contract, so the same
 * adapter drives OpenAI-compatible servers (a local Ollama / vLLM / LM Studio
 * endpoint) by pointing `baseURL` at them.
 */
export interface OpenAiChatCompletionMessage {
  readonly content: string | null;
}

export interface OpenAiChatCompletionChoice {
  readonly message: OpenAiChatCompletionMessage;
  readonly finish_reason: string | null;
}

export interface OpenAiChatCompletionUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly prompt_tokens_details?: { readonly cached_tokens?: number };
}

export interface OpenAiChatCompletion {
  readonly choices: readonly OpenAiChatCompletionChoice[];
  readonly usage?: OpenAiChatCompletionUsage | null;
}

export interface OpenAiChatClient {
  readonly chat: {
    readonly completions: {
      create(params: Record<string, unknown>): Promise<OpenAiChatCompletion>;
    };
  };
}
