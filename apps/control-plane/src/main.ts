import { createDatabase } from '@donna/db';
import { InMemoryEventBus } from '@donna/events';
import { runMigrations } from 'graphile-worker';

import { buildServer, type ServerDeps } from './server.js';
import { DrizzleObjectiveService } from './services/drizzle-objective-service.js';
import { InMemoryObjectiveService } from './services/objective-service.js';
import {
  DrizzleTaskDispatcher,
  InMemoryTaskDispatcher,
  type TaskDispatcher,
} from './services/task-dispatcher.js';
import { InMemoryTaskService } from './services/task-service.js';
import { InMemoryWorkQueue } from './services/work-queue.js';

/**
 * Process entrypoint. With `DATABASE_URL` set, the API is durable: objectives
 * and tasks persist to Postgres and their events + jobs go through the
 * transactional outbox. Without it, the in-memory services back local runs (no
 * durability). The connection string comes from the environment / secrets
 * manager, never from source (§8).
 */
const connectionString = process.env.DATABASE_URL;

let deps: ServerDeps;
if (connectionString !== undefined && connectionString !== '') {
  // Ensure graphile-worker's schema exists so the dispatcher's transactional
  // `add_job` resolves even if the worker process has not booted yet.
  await runMigrations({ connectionString });
  const db = createDatabase(connectionString);
  deps = {
    objectiveService: new DrizzleObjectiveService(db),
    taskDispatcher: new DrizzleTaskDispatcher(db),
  };
} else {
  console.warn('DATABASE_URL not set — using in-memory services (state is not durable).');
  const bus = new InMemoryEventBus();
  const taskService = new InMemoryTaskService(bus);
  const taskDispatcher: TaskDispatcher = new InMemoryTaskDispatcher(
    taskService,
    new InMemoryWorkQueue(),
  );
  deps = {
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher,
  };
}

const app = buildServer(deps);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
