import { runWorker } from './worker.js';

/**
 * Process entrypoint. The connection string comes from the environment /
 * secrets manager, never from source (Technical Plan §8).
 */
const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('DATABASE_URL is required to start the worker.');
  process.exit(1);
}

const runner = await runWorker({ connectionString });
await runner.promise;
