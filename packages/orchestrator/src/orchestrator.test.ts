import type {
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  HealthReport,
  ModelAdapter,
  ModelCapabilities,
  ModelRequest,
  ModelResult,
  UsageRecord,
} from '@donna/adapter-base';
import type { ModelEntry } from '@donna/config';
import { UsageLedger } from '@donna/cost-governor';
import { AUTHORITY_LEVELS } from '@donna/core-domain';
import { InMemoryEventBus } from '@donna/events';
import { CapabilityRegistry } from '@donna/work-router';
import { describe, expect, it } from 'vitest';

import { executeWorkOrder } from './orchestrator.js';
import type { OrchestratorDeps, WorkOrder } from './work-order.js';

const cloudModel: ModelEntry = {
  id: 'claude-sonnet-5',
  provider: 'anthropic',
  displayName: 'Claude Sonnet 5',
  contextTokens: 1_000_000,
  inputCostPer1M: 2,
  outputCostPer1M: 10,
  capabilities: { tools: true, vision: true, reasoning: true },
  tierRange: [3, 7],
  privacy: 'cloud',
  available: true,
};

/** A fake ModelAdapter with configurable execute behavior. */
function fakeModelAdapter(
  execute: (input: ModelRequest) => Promise<ModelResult>,
  classify: (e: unknown) => ErrorClass = () => 'unknown',
): ModelAdapter {
  return {
    id: 'fake',
    name: 'fake',
    version: '1',
    capabilities: (): CapabilitySpec => ({
      id: 'fake',
      name: 'fake',
      version: '1',
      capabilities: [],
    }),
    modelCapabilities: (): ModelCapabilities => ({
      contextTokens: 1_000_000,
      supportsTools: true,
      supportsVision: true,
      supportsStreaming: true,
      supportsReasoning: true,
    }),
    health: (): Promise<HealthReport> => Promise.resolve({ status: 'healthy' }),
    estimate: (): Promise<CostEstimate> =>
      Promise.resolve({ costUsd: 0.01, latencyMs: 0, confidence: 0.5 }),
    execute: (input): Promise<ModelResult> => execute(input),
    reportUsage: (): UsageRecord | undefined => undefined,
    classifyError: classify,
  };
}

function okResult(text: string): ModelResult {
  return {
    text,
    finishReason: 'end_turn',
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, latencyMs: 12 },
  };
}

function makeDeps(over: Partial<OrchestratorDeps> = {}): {
  deps: OrchestratorDeps;
  events: string[];
  ledger: UsageLedger;
} {
  const bus = new InMemoryEventBus();
  const events: string[] = [];
  bus.subscribe('*', (e) => {
    events.push(e.type);
  });
  const ledger = new UsageLedger();
  const deps: OrchestratorDeps = {
    bus,
    workRegistry: new CapabilityRegistry(),
    modelRegistry: [cloudModel],
    ledger,
    resolveModelAdapter: () =>
      fakeModelAdapter((i) =>
        Promise.resolve(okResult(`echo:${i.messages.at(-1)?.content ?? ''}`)),
      ),
    ...over,
  };
  return { deps, events, ledger };
}

const aiOrder: WorkOrder = {
  organizationId: 'org1',
  taskId: 'task1',
  requiredCapabilities: ['reasoning'],
  needsReasoning: true,
  reasoningTier: 5,
  modelRequest: { messages: [{ role: 'user', content: 'Summarize Route 40' }] },
};

describe('executeWorkOrder — AI path', () => {
  it('routes to a model, runs the adapter, records usage, emits events', async () => {
    const { deps, events, ledger } = makeDeps();
    const result = await executeWorkOrder(aiOrder, deps);

    expect(result.status).toBe('completed');
    expect(result.executionClass).toBe('cloud_ai');
    expect(result.modelId).toBe('claude-sonnet-5');
    expect(result.text).toBe('echo:Summarize Route 40');
    expect(ledger.totalUsd()).toBeCloseTo(0.001);
    expect(events).toContain('task.planned');
    expect(events).toContain('worker.started');
    expect(events).toContain('task.completed');
  });

  it('fails when the AI order carries no model request', async () => {
    const { deps } = makeDeps();
    const result = await executeWorkOrder({ ...aiOrder, modelRequest: undefined }, deps);
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_model_request');
  });

  it('fails when no adapter resolves', async () => {
    const { deps, events } = makeDeps({ resolveModelAdapter: () => undefined });
    const result = await executeWorkOrder(aiOrder, deps);
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('no_adapter');
    expect(events).toContain('task.failed');
  });

  it('blocks when the estimate exceeds budget', async () => {
    const { deps } = makeDeps();
    const result = await executeWorkOrder(
      {
        ...aiOrder,
        budget: { budget: { scope: 'task', scopeRef: 'task1', limitUsd: 0.001 }, spentUsd: 0 },
      },
      deps,
    );
    expect(result.status).toBe('budget_exceeded');
  });

  it('falls back to the next model on a retryable error', async () => {
    const twoModels: ModelEntry[] = [
      { ...cloudModel, id: 'a', outputCostPer1M: 5, tierRange: [3, 7] },
      { ...cloudModel, id: 'b', outputCostPer1M: 10, tierRange: [3, 7] },
    ];
    const bad = fakeModelAdapter(
      () => Promise.reject(new Error('rl')),
      () => 'rate_limit',
    );
    const good = fakeModelAdapter((i) => Promise.resolve(okResult(`ok:${i.messages.length}`)));
    const { deps } = makeDeps({
      modelRegistry: twoModels,
      resolveModelAdapter: (id) => (id === 'a' ? bad : good),
    });
    const result = await executeWorkOrder(aiOrder, deps);
    expect(result.status).toBe('completed');
    expect(result.modelId).toBe('b');
  });

  it('does not fall back on a deterministic error', async () => {
    const bad = fakeModelAdapter(
      () => Promise.reject(new Error('bad request')),
      () => 'deterministic',
    );
    const { deps } = makeDeps({ resolveModelAdapter: () => bad });
    const result = await executeWorkOrder(aiOrder, deps);
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('adapter_error');
  });
});

describe('executeWorkOrder — gates and non-AI classes', () => {
  it('denies when policy denies (cross-tenant), without executing', async () => {
    const { deps, events } = makeDeps();
    const result = await executeWorkOrder(
      {
        ...aiOrder,
        policy: {
          principal: {
            userId: 'u1',
            organizationId: 'org1',
            role: 'team_member',
            actorKind: 'agent',
            teamIds: [],
            projectIds: [],
          },
          action: { name: 'x', authorityLevel: AUTHORITY_LEVELS.PREPARE, sideEffecting: false },
          resource: { organizationId: 'org2', scope: 'ORGANIZATION' },
        },
      },
      deps,
    );
    expect(result.status).toBe('denied');
    expect(events).not.toContain('task.completed');
  });

  it('returns approval_required for a level-3 action', async () => {
    const { deps, events } = makeDeps();
    const result = await executeWorkOrder(
      {
        ...aiOrder,
        policy: {
          principal: {
            userId: 'u1',
            organizationId: 'org1',
            role: 'executive',
            actorKind: 'agent',
            teamIds: [],
            projectIds: [],
          },
          action: {
            name: 'deploy',
            authorityLevel: AUTHORITY_LEVELS.APPROVAL_REQUIRED,
            sideEffecting: true,
          },
          resource: { organizationId: 'org1', scope: 'ORGANIZATION' },
        },
      },
      deps,
    );
    expect(result.status).toBe('approval_required');
    expect(events).toContain('approval.requested');
  });

  it('parks a human-routed order as awaiting_human', async () => {
    const { deps } = makeDeps();
    const result = await executeWorkOrder({ ...aiOrder, prefersHuman: true }, deps);
    expect(result.status).toBe('awaiting_human');
    expect(result.executionClass).toBe('human');
  });

  it('blocks a deterministic-capability order until a capability adapter exists', async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'crm.sync',
      executionClass: 'deterministic',
      provides: ['crm'],
      health: 'healthy',
    });
    const { deps } = makeDeps({ workRegistry: registry });
    const result = await executeWorkOrder(
      { organizationId: 'org1', requiredCapabilities: ['crm'] },
      deps,
    );
    expect(result.status).toBe('blocked');
    expect(result.executionClass).toBe('deterministic');
    expect(result.capabilityId).toBe('crm.sync');
  });
});
