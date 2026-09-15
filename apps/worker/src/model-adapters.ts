import { AnthropicModelAdapter } from '@donna/adapter-anthropic';
import type { ModelAdapter } from '@donna/adapter-base';
import { LocalModelAdapter } from '@donna/adapter-local';
import { OpenAiModelAdapter } from '@donna/adapter-openai';
import { MODEL_REGISTRY, type ModelEntry } from '@donna/config';

export type ModelAdapterResolver = (modelId: string) => ModelAdapter | undefined;

/**
 * Build the composition-root resolver that binds a model id to a concrete,
 * provider-specific {@link ModelAdapter}.
 *
 * This is the ONE place in the worker that names a provider; the orchestrator
 * stays provider-agnostic and receives the result through
 * `deps.resolveModelAdapter` (Technical Plan §7.2 — the provider-independence
 * boundary). Adapters are built lazily and cached per model id, and provider
 * credentials come from the environment / secrets manager, never from source
 * (§8):
 *   - Anthropic reads `ANTHROPIC_API_KEY`.
 *   - OpenAI is wired only when `OPENAI_API_KEY` is set (optional
 *     `OPENAI_BASE_URL` for a proxy); absent → `undefined`, no crash.
 *   - Local is wired only when `LOCAL_MODEL_BASE_URL` points at an
 *     OpenAI-compatible server (optional `LOCAL_MODEL_API_KEY`).
 *
 * A model whose provider is not configured resolves to `undefined`; the
 * orchestrator then falls through its model chain or fails the order with
 * `no_adapter`, rather than the worker crashing.
 */
export function createModelAdapterResolver(
  registry: readonly ModelEntry[] = MODEL_REGISTRY,
  env: Record<string, string | undefined> = process.env,
): ModelAdapterResolver {
  const byId = new Map(registry.map((m) => [m.id, m]));
  const cache = new Map<string, ModelAdapter>();

  return (modelId) => {
    const cached = cache.get(modelId);
    if (cached !== undefined) return cached;

    const model = byId.get(modelId);
    if (model === undefined) return undefined;

    let adapter: ModelAdapter | undefined;
    switch (model.provider) {
      case 'anthropic':
        adapter = new AnthropicModelAdapter({ model });
        break;
      case 'openai': {
        const apiKey = env['OPENAI_API_KEY'];
        const baseURL = env['OPENAI_BASE_URL'];
        adapter =
          apiKey !== undefined && apiKey !== ''
            ? new OpenAiModelAdapter({
                model,
                apiKey,
                ...(baseURL !== undefined && baseURL !== '' ? { baseURL } : {}),
              })
            : undefined;
        break;
      }
      case 'local': {
        const baseURL = env['LOCAL_MODEL_BASE_URL'];
        const apiKey = env['LOCAL_MODEL_API_KEY'];
        adapter =
          baseURL !== undefined && baseURL !== ''
            ? new LocalModelAdapter({
                model,
                baseURL,
                ...(apiKey !== undefined && apiKey !== '' ? { apiKey } : {}),
              })
            : undefined;
        break;
      }
      default:
        adapter = undefined;
    }

    if (adapter !== undefined) cache.set(modelId, adapter);
    return adapter;
  };
}
