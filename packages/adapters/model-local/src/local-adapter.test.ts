import type { OpenAiChatClient, OpenAiChatCompletion } from '@donna/adapter-openai';
import type { ModelEntry } from '@donna/config';
import { describe, expect, it, vi } from 'vitest';

import { LocalModelAdapter } from './local-adapter.js';

const model: ModelEntry = {
  id: 'local-small',
  provider: 'local',
  displayName: 'Local Small',
  contextTokens: 32_000,
  inputCostPer1M: 0,
  outputCostPer1M: 0,
  capabilities: { tools: false, vision: false, reasoning: false },
  tierRange: [0, 3],
  privacy: 'local',
  available: true,
};

function fakeClient(response: OpenAiChatCompletion): {
  client: OpenAiChatClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { chat: { completions: { create } } }, create };
}

const okResponse: OpenAiChatCompletion = {
  choices: [{ message: { content: 'local reply' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

describe('LocalModelAdapter', () => {
  it('carries the local id/name prefix and the model capabilities', () => {
    const { client } = fakeClient(okResponse);
    const adapter = new LocalModelAdapter({ model, baseURL: 'http://127.0.0.1:11434/v1', client });
    expect(adapter.id).toBe('local:local-small');
    expect(adapter.name).toBe('Local Local Small');
    expect(adapter.modelCapabilities().contextTokens).toBe(32_000);
  });

  it('executes through the composed OpenAI adapter (free local inference)', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new LocalModelAdapter({ model, baseURL: 'http://127.0.0.1:11434/v1', client });

    const result = await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(result.text).toBe('local reply');
    expect(result.finishReason).toBe('stop');
    // Local model pricing is 0 → no cost recorded.
    expect(result.usage.costUsd).toBe(0);
    expect(adapter.reportUsage()?.costUsd).toBe(0);
    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.model).toBe('local-small');
  });

  it('delegates error classification to the OpenAI taxonomy', () => {
    const { client } = fakeClient(okResponse);
    const adapter = new LocalModelAdapter({ model, baseURL: 'http://127.0.0.1:11434/v1', client });
    expect(adapter.classifyError(new Error('boom'))).toBe('unknown');
  });
});
