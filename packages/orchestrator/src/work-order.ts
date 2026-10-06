import type { CapabilityAdapter, ModelAdapter, ModelRequest } from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import type { Budget, UsageRecorder } from '@donna/cost-governor';
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
  /** Independent execution risk, 0-10. */
  readonly riskLevel?: number;
  /** Explicit minimum predicted first-pass quality/acceptance, 0..1. */
  readonly minQuality?: number;
  /** Expected request size used for route economics before provider execution. */
  readonly expectedInputTokens?: number;
  readonly expectedOutputTokens?: number;
  /** Hard end-to-end latency ceiling when runtime latency telemetry exists. */
  readonly maxLatencyMs?: number;
  /** Fail closed when no eligible model reaches the quality floor. */
  readonly strictQuality?: boolean;
  /** Runtime health/quality/latency telemetry keyed by model id. */
  readonly modelRuntimeSignals?: Readonly<
    Record<
      string,
      {
        readonly acceptanceRate?: number;
        readonly qualityScore?: number;
        readonly expectedLatencyMs?: number;
        readonly health?: 'healthy' | 'degraded' | 'unhealthy';
      }
    >
  >;
  readonly modelRequest?: ModelRequest;
  /** Hard routing input. Defaults to INTERNAL when omitted. */
  readonly dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  /** Versioned routing policy for attribution and safe canarying. */
  readonly routePolicyVersion?: string;

  /** Payload handed to a non-AI capability adapter's `execute` (§7.4). */
  readonly capabilityInput?: unknown;

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
  /** Result returned by a non-AI capability adapter. */
  readonly output?: unknown;
  readonly reason?: string;
}

export interface OrchestratorDeps {
  readonly bus: EventBus;
  readonly workRegistry: CapabilityRegistry;
  readonly modelRegistry: readonly ModelEntry[];
  readonly ledger: UsageRecorder;
  /** Durable audit sink for every AI model-routing decision. */
  readonly routingDecisions?: RoutingDecisionRecorder;
  /** Resolve a bound ModelAdapter for a model id (composition root wires vendors). */
  readonly resolveModelAdapter: (modelId: string) => ModelAdapter | undefined;
  /**
   * Resolve a bound non-AI capability adapter for a Work-Router capability id.
   * Optional: when absent, non-AI classes park as `blocked` (no adapter wired).
   */
  readonly resolveCapabilityAdapter?: (capabilityId: string) => CapabilityAdapter | undefined;
}

export interface RoutingDecisionRecord {
  readonly organizationId: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly routePolicyVersion: string;
  readonly reasoningTier: number;
  readonly dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  readonly candidates: readonly {
    readonly modelId: string;
    readonly predictedQuality: number;
    readonly requiredQuality: number;
    readonly meetsQualityFloor: boolean;
    readonly expectedCostUsd: number;
    readonly expectedCostPerAcceptedResultUsd: number;
    readonly expectedLatencyMs?: number;
    readonly health: 'healthy' | 'degraded' | 'unhealthy';
  }[];
  readonly selectedRoute: string;
  readonly selectedModelId?: string;
  readonly reason: string;
  readonly expectedCostUsd?: number;
  readonly expectedQuality?: number;
  readonly expectedLatencyMs?: number;
  readonly fallbackDepth: number;
}

export interface RoutingDecisionOutcome {
  readonly outcome: string;
  readonly selectedModelId?: string;
  readonly fallbackDepth: number;
}

export interface RoutingDecisionRecorder {
  record(entry: RoutingDecisionRecord): string | undefined | Promise<string | undefined>;
  complete?(receiptId: string, outcome: RoutingDecisionOutcome): void | Promise<void>;
}
