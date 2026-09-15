import { createDatabase } from '@donna/db';
import { InMemoryEventBus, OutboxDispatcher, type EventBus } from '@donna/events';
import { run, type Runner } from 'graphile-worker';

import { DrizzleOutboxStore } from './outbox-store.js';

export interface WorkerConfig {
  readonly connectionString: string;
  /** Max events delivered per outbox dispatch tick. */
  readonly outboxBatchSize?: number;
  /**
   * Event bus to deliver dispatched events to. Defaults to an in-process bus;
   * the production transport (Postgres LISTEN/NOTIFY / Realtime) is injected
   * here later without changing this runtime.
   */
  readonly bus?: EventBus;
}

/**
 * Start the durable-queue worker runtime (Technical Plan §5).
 *
 * graphile-worker provides the durable job queue — leases, heartbeats, bounded
 * retries and crash-safe reclamation — so a closed browser or a dead worker
 * never loses an objective. A scheduled `dispatch-outbox` task drains the
 * transactional outbox to the event bus.
 *
 * This bootstraps external infrastructure (Postgres, background workers) and is
 * therefore integration-tested against a live database, not in unit CI.
 */
export async function runWorker(config: WorkerConfig): Promise<Runner> {
  const db = createDatabase(config.connectionString);
  const bus = config.bus ?? new InMemoryEventBus();
  const dispatcher = new OutboxDispatcher(new DrizzleOutboxStore(db), bus);
  const batchSize = config.outboxBatchSize ?? 500;

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
    },
  });
}
