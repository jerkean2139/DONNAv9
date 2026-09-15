import type { ErrorClass, HealthReport, HealthStatus } from './contracts.js';

const SEVERITY: Record<HealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  offline: 2,
};

/**
 * Aggregate many health reports into the worst status — used when a capability
 * depends on several backends and is only as healthy as its weakest link.
 */
export function worstHealth(reports: readonly HealthReport[]): HealthStatus {
  let worst: HealthStatus = 'healthy';
  for (const r of reports) {
    if (SEVERITY[r.status] > SEVERITY[worst]) worst = r.status;
  }
  return worst;
}

/**
 * Whether a failure is worth retrying (possibly on an alternate
 * adapter/node/model). Deterministic and auth failures are not retried blindly
 * (Technical Plan §5, Build Bible doc 04 failure flow).
 */
export function isRetryable(cls: ErrorClass): boolean {
  return cls === 'transient' || cls === 'rate_limit' || cls === 'unavailable';
}
