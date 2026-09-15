# @donna/adapter-openai

OpenAI implementation of the `ModelAdapter` contract (Technical Plan §7). The
only place the `openai` SDK is imported; business logic depends on
`@donna/adapter-base`, keeping the provider replaceable.

Because it speaks the stable OpenAI **Chat Completions** contract, the same
adapter drives any **OpenAI-compatible** server (a local Ollama / vLLM / LM
Studio node) by pointing `baseURL` at it — that is exactly how
`@donna/adapter-local` reuses it.

```ts
import { OpenAiModelAdapter } from '@donna/adapter-openai';

const gpt = new OpenAiModelAdapter({ model, apiKey: process.env.OPENAI_API_KEY });
const result = await gpt.execute({ messages: [{ role: 'user', content: 'Hi' }] });
```

- **Secrets stay out of source** — the API key comes from the environment /
  secrets manager (§8).
- **Provider-neutral errors** — HTTP status maps to the shared `ErrorClass`
  taxonomy (`429 → rate_limit`, `401/403 → auth`, `5xx → unavailable`, other
  `4xx → deterministic`, connection/timeout → `transient`), so the orchestrator's
  retry/fallback logic stays in one place.
- **`reasoning_effort` is opt-in** (`reasoningEffort: true`) — plain chat models
  and most OpenAI-compatible servers reject the field.
- **Testable without a key or network** — inject a structural `client`.
