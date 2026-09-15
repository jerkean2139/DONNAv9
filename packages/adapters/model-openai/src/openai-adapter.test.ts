import type { ModelEntry } from '@donna/config';
import { APIError } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import type { OpenAiChatClient, OpenAiChatCompletion } from './client.js';
import { OpenAiModelAdapter, reasoningEffortForTier } from './openai-adapter.js';

const model: ModelEntry = {
  id: 'openai-frontier',
  provider: 'openai',
  displayName: 'OpenAI Frontier',
  contextTokens: 400_000,
  inputCostPer1M: 5,
  outputCostPer1M: 20,
  capabilities: { tools: true, vision: true, reasoning: true },
  tierRange: [6, 9],
  privacy: 'cloud',
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
  choices: [{ message: { content: 'Hello world' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
};

describe('reasoningEffortForTier', () => {
  it('maps tiers to OpenAI effort levels', () => {
    expect(reasoningEffortForTier(0)).toBe('low');
    expect(reasoningEffortForTier(3)).toBe('low');
    expect(reasoningEffortForTier(5)).toBe('medium');
    expect(reasoningEffortForTier(7)).toBe('medium');
    expect(reasoningEffortForTier(8)).toBe('high');
  });
});

describe('OpenAiModelAdapter.execute', () => {
  it('maps request → OpenAI chat params (roles, max_tokens)', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new OpenAiModelAdapter({ model, client });

    await adapter.execute({
      messages: [
        { role: 'system', content: 'You are Donna.' },
        { role: 'user', content: 'Hi' },
      ],
      maxOutputTokens: 2048,
    });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.model).toBe('openai-frontier');
    expect(params.max_tokens).toBe(2048);
    expect(params.messages).toEqual([
      { role: 'system', content: 'You are Donna.' },
      { role: 'user', content: 'Hi' },
    ]);
    // reasoning_effort is off unless explicitly enabled.
    expect(params.reasoning_effort).toBeUndefined();
  });

  it('sends reasoning_effort only when enabled', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new OpenAiModelAdapter({ model, client, reasoningEffort: true });

    await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }], reasoningTier: 8 });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.reasoning_effort).toBe('high');
  });

  it('maps the response → ModelResult with computed cost', async () => {
    const { client } = fakeClient(okResponse);
    const adapter = new OpenAiModelAdapter({ model, client });

    const result = await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(result.text).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(1_000_000);
    // 1M input @ $5 + 1M output @ $20 = $25
    expect(result.usage.costUsd).toBeCloseTo(25);
    expect(adapter.reportUsage()?.costUsd).toBeCloseTo(25);
  });

  it('handles a null message content and missing usage', async () => {
    const { client } = fakeClient({
      choices: [{ message: { content: null }, finish_reason: 'length' }],
      usage: null,
    });
    const adapter = new OpenAiModelAdapter({ model, client });

    const result = await adapter.execute({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(result.text).toBe('');
    expect(result.finishReason).toBe('length');
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.costUsd).toBe(0);
  });

  it('estimates cost without calling the API', async () => {
    const { client, create } = fakeClient(okResponse);
    const adapter = new OpenAiModelAdapter({ model, client });
    const est = await adapter.estimate({ messages: [{ role: 'user', content: 'hello' }] });
    expect(est.costUsd).toBeGreaterThanOrEqual(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the openai id prefix and reports model capabilities', () => {
    const { client } = fakeClient(okResponse);
    const adapter = new OpenAiModelAdapter({ model, client });
    expect(adapter.id).toBe('openai:openai-frontier');
    expect(adapter.name).toBe('OpenAI OpenAI Frontier');
    expect(adapter.modelCapabilities().contextTokens).toBe(400_000);
  });
});

describe('OpenAiModelAdapter.classifyError', () => {
  const { client } = fakeClient(okResponse);
  const adapter = new OpenAiModelAdapter({ model, client });

  function apiError(status: number | undefined): APIError {
    // APIError(status, error, message, headers)
    return new APIError(status, undefined, 'boom', undefined);
  }

  it('classifies by HTTP status', () => {
    expect(adapter.classifyError(apiError(429))).toBe('rate_limit');
    expect(adapter.classifyError(apiError(401))).toBe('auth');
    expect(adapter.classifyError(apiError(403))).toBe('auth');
    expect(adapter.classifyError(apiError(500))).toBe('unavailable');
    expect(adapter.classifyError(apiError(400))).toBe('deterministic');
    expect(adapter.classifyError(apiError(404))).toBe('deterministic');
  });

  it('classifies a connection error (no status) as transient', () => {
    expect(adapter.classifyError(apiError(undefined))).toBe('transient');
  });

  it('classifies a non-API error as unknown', () => {
    expect(adapter.classifyError(new Error('boom'))).toBe('unknown');
  });
});
