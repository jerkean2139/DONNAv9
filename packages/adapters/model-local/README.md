# @donna/adapter-local

Local (self-hosted) implementation of the `ModelAdapter` contract (Technical
Plan §7/§9). A local model runs behind an **OpenAI-compatible** server (Ollama /
vLLM / LM Studio), so this **composes `@donna/adapter-openai`** pointed at the
local endpoint — the same way `@donna/adapter-ghl` composes the HTTP adapter —
instead of duplicating the SDK integration.

```ts
import { LocalModelAdapter } from '@donna/adapter-local';

const local = new LocalModelAdapter({ model, baseURL: 'http://127.0.0.1:11434/v1' });
const result = await local.execute({ messages: [{ role: 'user', content: 'Hi' }] });
```

- **`local:` id prefix + `privacy: 'local'`** registry entry — what the Model
  Router uses for privacy-constrained routing (`requireLocal`).
- **No cloud key** — the endpoint URL comes from the environment / composition
  root; the SDK's required key defaults to a harmless placeholder that local
  servers ignore.
- **Same error taxonomy** — classification is delegated to the OpenAI adapter, so
  local failures route through the orchestrator's retry/fallback like any other
  model.
