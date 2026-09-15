import type { ModelEntry } from '@donna/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createModelAdapterResolver } from './model-adapters.js';

const caps = { tools: true, vision: true, reasoning: true };

const anthropic: ModelEntry = {
  id: 'claude-sonnet-5',
  provider: 'anthropic',
  displayName: 'Claude Sonnet 5',
  contextTokens: 1_000_000,
  inputCostPer1M: 2,
  outputCostPer1M: 10,
  capabilities: caps,
  tierRange: [3, 7],
  privacy: 'cloud',
  available: true,
};

const openai: ModelEntry = {
  ...anthropic,
  id: 'openai-x',
  provider: 'openai',
  displayName: 'OpenAI X',
};

describe('createModelAdapterResolver', () => {
  let priorKey: string | undefined;

  beforeEach(() => {
    priorKey = process.env['ANTHROPIC_API_KEY'];
    // The Anthropic SDK constructor requires a key; a dummy is enough to build
    // the adapter (no network call is made during construction).
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
  });

  afterEach(() => {
    if (priorKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
    else process.env['ANTHROPIC_API_KEY'] = priorKey;
  });

  it('returns undefined for a model id not in the registry', () => {
    const resolve = createModelAdapterResolver([anthropic]);
    expect(resolve('nope')).toBeUndefined();
  });

  it('returns undefined for a provider with no adapter yet', () => {
    const resolve = createModelAdapterResolver([openai]);
    expect(resolve('openai-x')).toBeUndefined();
  });

  it('binds an Anthropic model to an AnthropicModelAdapter', () => {
    const resolve = createModelAdapterResolver([anthropic]);
    const adapter = resolve('claude-sonnet-5');
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('anthropic:claude-sonnet-5');
  });

  it('caches the adapter per model id', () => {
    const resolve = createModelAdapterResolver([anthropic]);
    expect(resolve('claude-sonnet-5')).toBe(resolve('claude-sonnet-5'));
  });
});
