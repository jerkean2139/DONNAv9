export const BASELINE_ROUTE_POLICY = 'baseline-v1' as const;
export const MAXIMUM_LOGIC_ROUTE_POLICY = 'maximum-logic-v1' as const;

export type RoutePolicyVersion =
  | typeof BASELINE_ROUTE_POLICY
  | typeof MAXIMUM_LOGIC_ROUTE_POLICY;

export interface RoutePolicySelectionInput {
  readonly organizationId: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  /** Percentage of requests assigned to Maximum Logic, 0..100. */
  readonly maximumLogicPercent: number;
  /** Explicit override for testing, incident response, or controlled rollout. */
  readonly forcePolicy?: RoutePolicyVersion;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic canary assignment. The same work identity stays in the same
 * cohort, so comparisons are reproducible and do not require an LLM or RNG.
 */
export function selectRoutePolicy(input: RoutePolicySelectionInput): RoutePolicyVersion {
  if (input.forcePolicy !== undefined) return input.forcePolicy;

  const percent = Math.min(100, Math.max(0, input.maximumLogicPercent));
  if (percent === 0) return BASELINE_ROUTE_POLICY;
  if (percent === 100) return MAXIMUM_LOGIC_ROUTE_POLICY;

  const identity = [
    input.organizationId,
    input.taskId ?? '',
    input.correlationId ?? '',
  ].join(':');
  const bucket = stableHash(identity) % 100;

  return bucket < percent ? MAXIMUM_LOGIC_ROUTE_POLICY : BASELINE_ROUTE_POLICY;
}
