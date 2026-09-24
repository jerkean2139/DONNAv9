import { MODEL_REGISTRY } from '@donna/config';
import { UsageLedger } from '@donna/cost-governor';
import { createDatabase } from '@donna/db';
import { InMemoryEventBus, OutboxDispatcher, type EventBus } from '@donna/events';
import {
  CapabilityCatalog,
  executeWorkOrder,
  EXECUTE_WORK_ORDER_TASK,
  type OrchestratorDeps,
} from '@donna/orchestrator';
import { CapabilityRegistry } from '@donna/work-router';
import { run, type Runner } from 'graphile-worker';

import { createModelAdapterResolver } from './model-adapters.js';
import { DrizzleOutboxBus } from './outbox-bus.js';
import { DrizzleOutboxStore } from './outbox-store.js';
import { BufferingEventBus, TaskStateStore } from './task-state.js';
import { parseWorkOrder } from './work-order-payload.js';

export interface WorkerConfig {
  readonly connectionString: string;
  /** Max events delivered per outbox dispatch tick. */
  readonly outboxBatchSize?: number;
  /**
   * The *delivered* event bus — where the {@link OutboxDispatcher} publishes
   * events for UI projections and side-effect handlers. Defaults to an
   * in-process bus; the production transport (Postgres LISTEN/NOTIFY / Realtime)
   * is injected here later without changing this runtime.
   */
  readonly bus?: EventBus;
  /**
   * Non-AI capability catalog — the single source of truth for the Work Router
   * registry and the capability-adapter resolver (they must not drift). Empty by
   * default, so non-AI classes park as `blocked` until real adapters register.
   * Takes precedence over `workRegistry` when provided.
   */
  readonly capabilityCatalog?: CapabilityCatalog;
  /**
   * Capability registry the Work Router consults directly. Used only when no
   * `capabilityCatalog` is given; the catalog is the preferred wiring.
   */
  readonly workRegistry?: CapabilityRegistry;
}

/**
 * Start the durable-queue worker runtime (Technical Plan §5).
 *
 * graphile-worker provides the durable job queue — leases, heartbeats, bounded
 * retries and crash-safe reclamation — so a closed browser or a dead worker
 * never loses an objective. Two responsibilities run here:
 *
 *  - `execute-work-order` runs one enqueued {@link WorkOrder} through the
 *    orchestrator (policy gate → Work Router → Model Router → cost ledger). The
 *    orchestrator publishes to a {@link DrizzleOutboxBus}, so every transition is
 *    recorded in the `events` table (the write half of the transactional
 *    outbox) rather than delivered live.
 *  - the scheduled `dispatch-outbox` task drains that outbox to the delivered
 *    bus, marking each event dispatched (the read half).
 *
 * This bootstraps external infrastructure (Postgres, background workers) and is
 * therefore integration-tested against a live database, not in unit CI.
 */
export async function runWorker(config: WorkerConfig): Promise<Runner> {
  const db = createDatabase(config.connectionString);
  const deliveredBus = config.bus ?? new InMemoryEventBus();
  const dispatcher = new OutboxDispatcher(new DrizzleOutboxStore(db), deliveredBus);
  const batchSize = config.outboxBatchSize ?? 500;
  // Persists the authoritative task-row transition after each run (SEC-4).
  const taskState = new TaskStateStore(db);
  // Fallback outbox for ad-hoc orders that carry no durable task row.
  const outboxBus = new DrizzleOutboxBus(db);

  // Orchestrator dependencies (the composition root). The orchestrator stays
  // provider-agnostic: vendors are bound only in the resolvers, and its events
  // are written to the outbox — never delivered live from here. The capability
  // catalog feeds both the Work Router registry and the capability resolver, so
  // routing and execution cannot drift.
  const catalog = config.capabilityCatalog;
  const deps: OrchestratorDeps = {
    bus: new DrizzleOutboxBus(db),
    workRegistry: catalog?.toWorkRegistry() ?? config.workRegistry ?? new CapabilityRegistry(),
    modelRegistry: MODEL_REGISTRY,
    ledger: new UsageLedger(),
    resolveModelAdapter: createModelAdapterResolver(MODEL_REGISTRY),
    ...(catalog !== undefined ? { resolveCapabilityAdapter: catalog.resolver() } : {}),
  };

  return run({
    connectionString: config.connectionString,
    concurrency: 4,
    // graphile-worker installs and manages its own schema/tables.
    // Cron granularity is one minute; a lower-latency transport replaces this
    // cadence when the production event bus lands.
    crontab: '* * * * * dispatch-outbox',
    taskList: {
      'dispatch-outbox': async () => {
        await dispatcher.dispatchBatch(batchSize);
      },
      [EXECUTE_WORK_ORDER_TASK]: async (payload) => {
        const order = parseWorkOrder(payload);
        // Buffer the orchestrator's execution trace so it can be committed
        // atomically with the authoritative task-row transition (SEC-4).
        const buffer = new BufferingEventBus();
        const result = await executeWorkOrder(order, { ...deps, bus: buffer });

        // An ad-hoc order with no durable task row: there is nothing to
        // transition, so just persist the trace to the outbox.
        if (order.taskId === undefined) {
          for (const event of buffer.drain()) await outboxBus.publish(event);
          console.info(
            `[execute-work-order] org=${order.organizationId} task=- status=${result.status}` +
              (result.reason !== undefined ? ` reason=${result.reason}` : ''),
          );
          return;
        }

        // Commit the task-row transition + trace in one transaction. A thrown
        // error here is transient (DB) — rethrow so graphile-worker retries the
        // whole job; the row is still `pending`, so the retry re-executes. A
        // business outcome (result.status) is NOT a job failure and never
        // rethrows.
        const outcome = await taskState.commitOutcome({
          taskId: order.taskId,
          organizationId: order.organizationId,
          result,
          events: buffer.drain(),
          order,
        });
        console.info(
          `[execute-work-order] org=${order.organizationId} task=${order.taskId} status=${result.status}` +
            (result.reason !== undefined ? ` reason=${result.reason}` : '') +
            ` applied=${outcome.applied}` +
            (outcome.applied
              ? ` task_status=${outcome.status} retried=${outcome.retried}`
              : ` reason=${outcome.reason}`),
        );
      },
    },
  });
}
