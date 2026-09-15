import type { ModelAdapter, ModelRequest } from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import type { Budget, UsageLedger } from '@donna/cost-governor';
import type { Actor, ExecutionClass } from '@donna/core-domain';
import type { EventBus } from '@donna/events';
import type { ActionDescriptor, PrincipalContext, ResourceDescriptor } from '@donna/policy';
import type { CapabilityRegistry } from '@donna/work-router';

/**
 * A unit of work handed to the orchestrator. It carries everything the routing
 * spine needs: what capabilities are required, the (optional) policy gate, and —
 * for AI work — the model request and routing hints.
 */
export interface WorkOrder {
  readonly organizationId: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly actor?: Actor;

  readonly requiredCapabilities: readonly string[];
  readonly prefersHuman?: boolean;
  readonly needsReasoning?: boolean;

  // Model routing hints (used when the Work Router selects an AI class).
  readonly reasoningTier?: number;
  readonly needsTools?: boolean;
  readonly needsVision?: boolean;
  readonly requireLocal?: boolean;
  readonly minContextTokens?: number;
  readonly modelRequest?: ModelRequest;

  /** Deterministic policy gate (Technical Plan §6). */
  readonly policy?: {
    readonly principal: PrincipalContext;
    readonly action: ActionDescriptor;
    readonly resource: ResourceDescriptor;
  };

  /** Pre-flight budget gate (Technical Plan §11). */
  readonly budget?: { readonly budget: Budget; readonly spentUsd: number };
}

/**
 * The graphile-worker task identifier for an enqueued work order. Shared by the
 * producer (the control-plane API's work queue) and the consumer (the worker's
 * task list), so the job contract has one source of truth.
 */
export const EXECUTE_WORK_ORDER_TASK = 'execute-work-order';

export type WorkOrderStatus =
  | 'completed'
  | 'awaiting_human'
  | 'approval_required'
  | 'denied'
  | 'blocked'
  | 'budget_exceeded'
  | 'failed';

export interface WorkOrderResult {
  readonly status: WorkOrderStatus;
  readonly executionClass?: ExecutionClass;
  readonly modelId?: string;
  readonly capabilityId?: string;
  readonly text?: string;
  readonly reason?: string;
}

export interface OrchestratorDeps {
  readonly bus: EventBus;
  readonly workRegistry: CapabilityRegistry;
  readonly modelRegistry: readonly ModelEntry[];
  readonly ledger: UsageLedger;
  /** Resolve a bound ModelAdapter for a model id (composition root wires vendors). */
  readonly resolveModelAdapter: (modelId: string) => ModelAdapter | undefined;
}
