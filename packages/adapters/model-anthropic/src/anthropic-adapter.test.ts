import type { ModelEntry } from '@donna/config';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicModelAdapter, effortForTier } from './anthropic-adapter.js';
import type { AnthropicMessageResponse, AnthropicMessagesClient } from './client.js';

const model: ModelEntry = {
  id: 'claude-opus-5',
  provider: 'anthropic',
  displayName: 'Claude Opus 5',
  contextTokens: 1_000_000,
  inputCostPer1M: 5,
  outputCostPer1M: 25,
  cachedInputCostPer1M: 0.5,
  capabilities: { tools: true, vision: true, reasoning: true },
  tierRange: [6, 9],
  privacy: 'cloud',
  available: true,
};

function fakeClient(response: AnthropicMessageResponse): {
  client: AnthropicMessagesClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { messages: { create } }, create };
}

const okResponse: AnthropicMessageResponse = {
  content: [
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'world' },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0 },
};

describe('effortForTier', () => {
  it('maps tiers to effort levels', () => {
    expect(effortForTier(0)).toBe('low');
    expect(effortForTier(4)).toBe('medium');
    expect(effortForTier(7)).toBe('high');
    expect(effortForTier(9)).toBe('xhigh');
    expect(effortForTier(10)).toBe('max');
  });
});

describe('AnthropicModelAdapter.execute', () => {
  it('maps request → Anthropic params (system split, thinking + effort)', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new AnthropicModelAdapter({ model, client });

    await adapter.execute({
      messages: [
        { role: 'system', content: 'You are Donna.' },
        { role: 'user', content: 'Hi' },
      ],
      reasoningTier: 7,
      maxOutputTokens: 2048,
    });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.model).toBe('claude-opus-5');
    expect(params.max_tokens).toBe(2048);
    expect(params.system).toBe('You are Donna.');
    expect(params.messages).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config).toEqual({ effort: 'high' });
  });

  it('maps the response → ModelResult with computed cost', async () => {
    const { client } = fakeClient(okResponse);
    const adapter = new AnthropicModelAdapter({ model, client });

    const result = await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(result.text).toBe('Hello world');
    expect(result.finishReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(1_000_000);
    // 1M input @ $5 + 1M output @ $25 = $30
    expect(result.usage.costUsd).toBeCloseTo(30);
    expect(adapter.reportUsage()?.costUsd).toBeCloseTo(30);
  });

  it('omits thinking/effort when reasoning is disabled', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new AnthropicModelAdapter({ model, client, enableThinking: false });

    await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }] });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.thinking).toBeUndefined();
    expect(params.output_config).toBeUndefined();
  });

  it('estimates cost without calling the API', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new AnthropicModelAdapter({ model, client });
    const est = await adapter.estimate({ messages: [{ role: 'user', content: 'hello' }] });
    expect(est.costUsd).toBeGreaterThanOrEqual(0);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AnthropicModelAdapter.classifyError', () => {
  it('classifies an unknown error as unknown', () => {
    const { client } = fakeClient(okResponse);
    const adapter = new AnthropicModelAdapter({ model, client });
    expect(adapter.classifyError(new Error('boom'))).toBe('unknown');
  });
});
