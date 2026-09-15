import type { ExecutionClass } from '@donna/core-domain';
import type { HealthStatus } from '@donna/adapter-base';

/**
 * A capability registered with the Work Router: which abstract capabilities it
 * provides, the execution class it runs as, and its current health.
 */
export interface RegisteredCapability {
  readonly id: string;
  readonly executionClass: ExecutionClass;
  readonly provides: readonly string[];
  readonly health: HealthStatus;
}

/**
 * The capability registry the Work Router consults (Technical Plan §1.2/§7).
 * Kept in-memory and pure here; a persistent registry backed by the DB and live
 * adapter health lands with the orchestrator.
 */
export class CapabilityRegistry {
  private readonly items: RegisteredCapability[] = [];

  register(capability: RegisteredCapability): void {
    this.items.push(capability);
  }

  all(): readonly RegisteredCapability[] {
    return this.items;
  }

  /**
   * Healthy capabilities that satisfy every one of `required`. Unhealthy or
   * offline capabilities are excluded — online does not mean available
   * (Build Bible doc 11).
   */
  healthyProviding(required: readonly string[]): RegisteredCapability[] {
    return this.items.filter(
      (c) => c.health === 'healthy' && required.every((r) => c.provides.includes(r)),
    );
  }
}
