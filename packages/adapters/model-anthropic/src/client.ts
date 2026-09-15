/**
 * Minimal structural interface for the parts of the Anthropic SDK the adapter
 * uses. Typing our own subset decouples the adapter from exact SDK param-type
 * churn and lets tests inject a fake client without a key or network.
 */
export interface AnthropicMessageResponseBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AnthropicMessageResponse {
  readonly content: readonly AnthropicMessageResponseBlock[];
  readonly stop_reason: string | null;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_read_input_tokens?: number;
  };
}

export interface AnthropicMessagesClient {
  readonly messages: {
    create(params: Record<string, unknown>): Promise<AnthropicMessageResponse>;
  };
}
