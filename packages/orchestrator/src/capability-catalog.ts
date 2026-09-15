import type { CapabilityAdapter, HealthStatus } from '@donna/adapter-base';
import type { ExecutionClass } from '@donna/core-domain';
import { CapabilityRegistry } from '@donna/work-router';

interface CatalogEntry {
  readonly adapter: CapabilityAdapter;
  readonly executionClass: ExecutionClass;
  readonly provides: readonly string[];
  readonly health: HealthStatus;
}

export interface RegisterOptions {
  /** Abstract capabilities this adapter provides; defaults to its own spec. */
  readonly provides?: readonly string[];
  /** Registration-time health; a live-probe refresh lands later. Default healthy. */
  readonly health?: HealthStatus;
}

/**
 * The single source of truth for non-AI capabilities. It holds concrete
 * {@link CapabilityAdapter}s and derives from them BOTH things the orchestrator
 * needs: the Work Router's {@link CapabilityRegistry} (for routing — id,
 * execution class, provided capabilities, health) and the id→adapter resolver
 * (for execution). Registering in one place keeps routing and execution from
 * drifting apart.
 *
 * The catalog names the execution class (an adapter contract does not), so a
 * `deterministic` function adapter and an `automation` adapter register the same
 * way. AI classes are not registered here — models route through the Model
 * Router, not the capability catalog.
 */
export class CapabilityCatalog {
  private readonly entries = new Map<string, CatalogEntry>();

  register(
    adapter: CapabilityAdapter,
    executionClass: ExecutionClass,
    options: RegisterOptions = {},
  ): this {
    this.entries.set(adapter.id, {
      adapter,
      executionClass,
      provides: options.provides ?? adapter.capabilities().capabilities,
      health: options.health ?? 'healthy',
    });
    return this;
  }

  /** Resolve the concrete adapter the Work Router matched by id. */
  resolve(id: string): CapabilityAdapter | undefined {
    return this.entries.get(id)?.adapter;
  }

  /** A resolver function for {@link OrchestratorDeps.resolveCapabilityAdapter}. */
  resolver(): (id: string) => CapabilityAdapter | undefined {
    return (id) => this.resolve(id);
  }

  /** Build the Work Router registry from the catalog's entries. */
  toWorkRegistry(): CapabilityRegistry {
    const registry = new CapabilityRegistry();
    for (const [id, entry] of this.entries) {
      registry.register({
        id,
        executionClass: entry.executionClass,
        provides: entry.provides,
        health: entry.health,
      });
    }
    return registry;
  }
}
