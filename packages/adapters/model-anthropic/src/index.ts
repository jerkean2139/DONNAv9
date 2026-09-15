/**
 * @donna/adapter-anthropic
 *
 * Anthropic (Claude) implementation of the `ModelAdapter` contract
 * (Technical Plan §7). The only place `@anthropic-ai/sdk` is imported — business
 * logic depends on `@donna/adapter-base`, keeping the provider replaceable. The
 * API key is read from the environment / secrets manager, never from source.
 */
export * from './anthropic-adapter.js';
export type {
  AnthropicMessagesClient,
  AnthropicMessageResponse,
  AnthropicMessageResponseBlock,
} from './client.js';
