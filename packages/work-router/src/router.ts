import type { ExecutionClass } from '@donna/core-domain';

import type { CapabilityRegistry, RegisteredCapability } from './registry.js';

/**
 * Preference order, least-complex reliable path first (Technical Plan §1.2/§4,
 * Build Bible V2-006). Deterministic software beats automation beats a human
 * beats AI; local AI beats cloud AI. The Work Router picks the CLASS; when the
 * class is AI, the Model Router (Phase 4) then selects the model/node.
 */
export const CLASS_PREFERENCE: readonly ExecutionClass[] = [
  'deterministic',
  'automation',
  'human',
  'browser',
  'coding_agent',
  'local_ai',
  'cloud_ai',
];

export interface WorkRoutingInput {
  readonly requiredCapabilities: readonly string[];
  /** The task needs human judgment, ownership, relationship, or policy. */
  readonly prefersHuman?: boolean;
  /** AI reasoning is required if no deterministic/automation path is available. */
  readonly needsReasoning?: boolean;
}

export type WorkRoutingReason =
  | 'human_required'
  | 'capability_matched'
  | 'ai_reasoning_required'
  | 'no_capability_fallback_human';

export interface WorkRoutingDecision {
  readonly executionClass: ExecutionClass;
  readonly capabilityId?: string;
  readonly reason: WorkRoutingReason;
  readonly message: string;
}

function byPreference(a: RegisteredCapability, b: RegisteredCapability): number {
  return CLASS_PREFERENCE.indexOf(a.executionClass) - CLASS_PREFERENCE.indexOf(b.executionClass);
}

/**
 * Decide how work should be executed BEFORE any model is chosen (V2-006).
 *
 * Deterministic and preference-ordered: never invoke an LLM when deterministic
 * software or an existing automation is sufficient. When AI is the right class,
 * the decision is coarse (`local_ai`/`cloud_ai`) and the Model Router refines
 * the exact model/node.
 */
export function routeWork(
  input: WorkRoutingInput,
  registry: CapabilityRegistry,
): WorkRoutingDecision {
  if (input.prefersHuman === true) {
    return {
      executionClass: 'human',
      reason: 'human_required',
      message: 'Task requires human judgment, ownership, or policy.',
    };
  }

  const candidates = registry.healthyProviding(input.requiredCapabilities);
  if (candidates.length > 0) {
    const chosen = [...candidates].sort(byPreference)[0]!;
    return {
      executionClass: chosen.executionClass,
      capabilityId: chosen.id,
      reason: 'capability_matched',
      message: `Matched capability "${chosen.id}" (${chosen.executionClass}).`,
    };
  }

  if (input.needsReasoning === true) {
    return {
      executionClass: 'cloud_ai',
      reason: 'ai_reasoning_required',
      message: 'No deterministic path; AI reasoning required (Model Router selects model/node).',
    };
  }

  return {
    executionClass: 'human',
    reason: 'no_capability_fallback_human',
    message: 'No capability available; routed to a human.',
  };
}

/**
 * Ordered execution-class candidates for the orchestrator's fallback chain:
 * the matched classes first (least-complex first), then cloud AI when reasoning
 * is allowed, always ending at a human. Deduplicated, order preserved.
 */
export function candidateClasses(
  input: WorkRoutingInput,
  registry: CapabilityRegistry,
): ExecutionClass[] {
  const ordered: ExecutionClass[] = [];
  const push = (c: ExecutionClass): void => {
    if (!ordered.includes(c)) ordered.push(c);
  };

  if (input.prefersHuman === true) push('human');
  for (const c of registry.healthyProviding(input.requiredCapabilities).sort(byPreference)) {
    push(c.executionClass);
  }
  if (input.needsReasoning === true) push('cloud_ai');
  push('human');
  return ordered;
}
