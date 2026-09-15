import { AnthropicModelAdapter } from '@donna/adapter-anthropic';
import type { ModelAdapter } from '@donna/adapter-base';
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
 * (§8) — the Anthropic adapter reads `ANTHROPIC_API_KEY` from the environment.
 *
 * A model whose provider has no adapter yet (openai, local) resolves to
 * `undefined`; the orchestrator then falls through its model chain or fails the
 * order with `no_adapter`, rather than the worker crashing.
 */
export function createModelAdapterResolver(
  registry: readonly ModelEntry[] = MODEL_REGISTRY,
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
      // openai / local model adapters land in a later increment.
      default:
        adapter = undefined;
    }

    if (adapter !== undefined) cache.set(modelId, adapter);
    return adapter;
  };
}
