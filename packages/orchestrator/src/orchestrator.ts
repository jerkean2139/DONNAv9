import { isRetryable } from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import { checkBudget } from '@donna/cost-governor';
import {
  isAiExecutionClass,
  type Actor,
  type CorrelationId,
  type EventType,
  type OrganizationId,
  type TaskId,
} from '@donna/core-domain';
import { createEvent } from '@donna/events';
import { evaluate } from '@donna/policy';
import { routeModel } from '@donna/model-router';
import { routeWork } from '@donna/work-router';

import type { OrchestratorDeps, WorkOrder, WorkOrderResult } from './work-order.js';

/**
 * Execute one work order end-to-end (Technical Plan §1.2 control flow):
 *
 *   policy gate → Work Router → (AI) Model Router + budget + adapter with
 *   fallback → cost ledger, emitting an event at every material transition.
 *
 * The orchestrator owns the durable transitions; the LLM is one replaceable
 * capability behind an adapter (Build Bible: "Donna is not an LLM"). Pure of any
 * provider SDK — vendors are resolved through `deps.resolveModelAdapter`.
 */
export async function executeWorkOrder(
  order: WorkOrder,
  deps: OrchestratorDeps,
): Promise<WorkOrderResult> {
  const actor: Actor = order.actor ?? { type: 'orchestrator', id: 'orchestrator' };

  const emit = async (type: EventType): Promise<void> => {
    await deps.bus.publish(
      createEvent({
        type,
        organizationId: order.organizationId as OrganizationId,
        actor,
        ...(order.taskId !== undefined ? { taskId: order.taskId as TaskId } : {}),
        ...(order.correlationId !== undefined
          ? { correlationId: order.correlationId as CorrelationId }
          : {}),
      }),
    );
  };

  // 1. Deterministic policy gate — never bypassable by model reasoning.
  if (order.policy !== undefined) {
    const decision = evaluate(order.policy);
    if (decision.effect === 'deny') {
      await emit('task.blocked');
      return { status: 'denied', reason: decision.reason };
    }
    if (decision.effect === 'requires_approval') {
      await emit('approval.requested');
      return { status: 'approval_required', reason: decision.reason };
    }
  }

  // 2. Work Router — decide the execution class before any model is chosen.
  const routing = routeWork(
    {
      requiredCapabilities: order.requiredCapabilities,
      ...(order.prefersHuman !== undefined ? { prefersHuman: order.prefersHuman } : {}),
      ...(order.needsReasoning !== undefined ? { needsReasoning: order.needsReasoning } : {}),
    },
    deps.workRegistry,
  );
  await emit('task.planned');

  if (routing.executionClass === 'human') {
    await emit('task.blocked');
    return { status: 'awaiting_human', executionClass: 'human', reason: routing.reason };
  }

  // 3a. Non-AI capability classes run through a bound capability adapter
  //     (deterministic/automation/…). If none is wired for the matched
  //     capability, the work parks as blocked rather than falling to an LLM.
  if (!isAiExecutionClass(routing.executionClass)) {
    const capabilityId = routing.capabilityId;
    const adapter =
      capabilityId !== undefined ? deps.resolveCapabilityAdapter?.(capabilityId) : undefined;
    if (adapter === undefined) {
      await emit('task.blocked');
      return {
        status: 'blocked',
        executionClass: routing.executionClass,
        reason: 'no_capability_adapter',
        ...(capabilityId !== undefined ? { capabilityId } : {}),
      };
    }

    const ctx = order.correlationId !== undefined ? { correlationId: order.correlationId } : {};

    if (order.budget !== undefined) {
      const est = await adapter.estimate(order.capabilityInput, ctx);
      const check = checkBudget(order.budget.budget, order.budget.spentUsd, est.costUsd);
      if (!check.allowed) {
        await emit('task.blocked');
        return {
          status: 'budget_exceeded',
          executionClass: routing.executionClass,
          ...(capabilityId !== undefined ? { capabilityId } : {}),
        };
      }
    }

    await emit('worker.started');
    await emit('tool.called');
    try {
      const output = await adapter.execute(order.capabilityInput, ctx);
      const usage = adapter.reportUsage();
      // Capability spend lands in the same ledger, keyed by capability id (no
      // tokens — deterministic/automation work is not model-metered).
      deps.ledger.record({
        modelId: capabilityId ?? adapter.id,
        provider: 'capability',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: usage?.costUsd ?? 0,
        latencyMs: usage?.latencyMs ?? 0,
        ...(order.taskId !== undefined ? { taskId: order.taskId } : {}),
      });
      await emit('task.completed');
      return {
        status: 'completed',
        executionClass: routing.executionClass,
        output,
        ...(capabilityId !== undefined ? { capabilityId } : {}),
      };
    } catch {
      // Capability failures do not fall back to another class here; the
      // orchestrator's cross-class fallback chain is a later increment.
      await emit('task.failed');
      return {
        status: 'failed',
        executionClass: routing.executionClass,
        reason: 'adapter_error',
        ...(capabilityId !== undefined ? { capabilityId } : {}),
      };
    }
  }

  // 3b. AI class → Model Router picks the model/node, then the adapter runs it.
  if (order.modelRequest === undefined) {
    await emit('task.failed');
    return {
      status: 'failed',
      executionClass: routing.executionClass,
      reason: 'missing_model_request',
    };
  }
  const modelRequest = order.modelRequest;

  const decision = routeModel(
    {
      reasoningTier: order.reasoningTier ?? 5,
      ...(order.needsTools !== undefined ? { needsTools: order.needsTools } : {}),
      ...(order.needsVision !== undefined ? { needsVision: order.needsVision } : {}),
      ...(order.requireLocal !== undefined ? { requireLocal: order.requireLocal } : {}),
      ...(order.minContextTokens !== undefined ? { minContextTokens: order.minContextTokens } : {}),
    },
    deps.modelRegistry,
  );
  if (decision === null) {
    await emit('task.failed');
    return {
      status: 'failed',
      executionClass: routing.executionClass,
      reason: 'no_eligible_model',
    };
  }

  const chain: readonly ModelEntry[] = [decision.model, ...decision.fallbacks];
  let lastErrorClass: string | undefined;

  for (const entry of chain) {
    const adapter = deps.resolveModelAdapter(entry.id);
    if (adapter === undefined) continue;

    if (order.budget !== undefined) {
      const est = await adapter.estimate(modelRequest, {});
      const check = checkBudget(order.budget.budget, order.budget.spentUsd, est.costUsd);
      if (!check.allowed) {
        await emit('task.blocked');
        return {
          status: 'budget_exceeded',
          executionClass: routing.executionClass,
          modelId: entry.id,
        };
      }
    }

    await emit('worker.started');
    await emit('tool.called');
    try {
      const result = await adapter.execute(modelRequest, {});
      deps.ledger.record({
        modelId: entry.id,
        provider: entry.provider,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
        latencyMs: result.usage.latencyMs,
        ...(result.usage.cachedInputTokens !== undefined
          ? { cachedInputTokens: result.usage.cachedInputTokens }
          : {}),
        ...(order.taskId !== undefined ? { taskId: order.taskId } : {}),
      });
      await emit('task.completed');
      return {
        status: 'completed',
        executionClass: routing.executionClass,
        modelId: entry.id,
        text: result.text,
      };
    } catch (error) {
      lastErrorClass = adapter.classifyError(error);
      // Only fall through to the next model on a retryable failure.
      if (!isRetryable(adapter.classifyError(error))) break;
    }
  }

  await emit('task.failed');
  return {
    status: 'failed',
    executionClass: routing.executionClass,
    reason: lastErrorClass === undefined ? 'no_adapter' : 'adapter_error',
  };
}
