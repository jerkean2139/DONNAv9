# @donna/adapter-anthropic

The Anthropic (Claude) implementation of the `ModelAdapter` contract
(`@donna/adapter-base`, Technical Plan §7). **The only place `@anthropic-ai/sdk`
is imported** — business logic depends on the adapter contract, so the provider
stays replaceable (V2-007).

## Usage

```ts
import { AnthropicModelAdapter } from '@donna/adapter-anthropic';
import { MODEL_REGISTRY } from '@donna/config';

const entry = MODEL_REGISTRY.find((m) => m.id === 'claude-opus-5')!;
const adapter = new AnthropicModelAdapter({ model: entry });
const result = await adapter.execute({
  messages: [
    { role: 'system', content: 'You are Donna.' },
    { role: 'user', content: 'Summarize this…' },
  ],
  reasoningTier: 7,
});
```

- Bound to a registry `ModelEntry` (id, pricing, capabilities). The Model Router
  picks the entry; the orchestrator uses the matching adapter.
- Maps the normalized `ModelRequest` → Anthropic params: system messages split
  into `system`, adaptive thinking + `effort` from the reasoning tier (disable
  via `enableThinking: false` for non-reasoning models like Haiku).
- Computes `costUsd` from the entry's pricing via `@donna/cost-governor`.
- `classifyError()` maps SDK errors to the normalized `ErrorClass` so the
  orchestrator owns retry/fallback.

## Auth & testing

The API key is read from the environment (`ANTHROPIC_API_KEY`) by the default
`new Anthropic()` client — **set it as a Railway secret, never in the repo**
(Technical Plan §8). The SDK client is injectable (`client` option), so the
adapter is unit-tested without a key or network.

Not exercised against the live API in CI. `health()` is optimistic for now; a
`models.retrieve` liveness probe and streaming for large `max_tokens` are
follow-ups.
