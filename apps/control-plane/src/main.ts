import { InMemoryEventBus } from '@donna/events';

import { buildServer } from './server.js';
import { InMemoryObjectiveService } from './services/objective-service.js';
import { InMemoryTaskService } from './services/task-service.js';
import {
  createGraphileWorkQueue,
  InMemoryWorkQueue,
  type WorkQueue,
} from './services/work-queue.js';

/**
 * Process entrypoint. Uses the in-memory services for now; the Drizzle-backed
 * services + real event transport are injected here once the DB wiring lands.
 *
 * The work queue is durable when `DATABASE_URL` is set — it enqueues into the
 * same Postgres graphile-worker uses — and falls back to an in-memory queue for
 * local runs without a database. The connection string comes from the
 * environment / secrets manager, never from source (§8).
 */
const bus = new InMemoryEventBus();

let workQueue: WorkQueue;
let releaseQueue: (() => Promise<void>) | undefined;
const connectionString = process.env.DATABASE_URL;
if (connectionString !== undefined && connectionString !== '') {
  const built = await createGraphileWorkQueue(connectionString);
  workQueue = built.queue;
  releaseQueue = built.release;
} else {
  console.warn('DATABASE_URL not set — using an in-memory work queue (jobs are not durable).');
  workQueue = new InMemoryWorkQueue();
}

const app = buildServer({
  objectiveService: new InMemoryObjectiveService(bus),
  taskService: new InMemoryTaskService(bus),
  workQueue,
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      if (releaseQueue !== undefined) await releaseQueue();
      process.exit(0);
    })();
  });
}
