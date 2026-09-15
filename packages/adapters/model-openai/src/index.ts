/**
 * @donna/adapter-openai
 *
 * OpenAI implementation of the `ModelAdapter` contract (Technical Plan §7). The
 * only place the `openai` SDK is imported — business logic depends on
 * `@donna/adapter-base`, keeping the provider replaceable. Speaks the OpenAI
 * Chat Completions contract, so the same adapter drives any OpenAI-compatible
 * server (local nodes) via `baseURL`. The API key is read from the environment /
 * secrets manager, never from source.
 */
export * from './openai-adapter.js';
export type {
  OpenAiChatClient,
  OpenAiChatCompletion,
  OpenAiChatCompletionChoice,
  OpenAiChatCompletionMessage,
  OpenAiChatCompletionUsage,
} from './client.js';
