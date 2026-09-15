import { buildCapabilityCatalog } from './capabilities.js';
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

// Bind non-AI capability adapters (e.g. GoHighLevel CRM) from the environment.
const capabilityCatalog = buildCapabilityCatalog();

const runner = await runWorker({
  connectionString,
  ...(capabilityCatalog !== undefined ? { capabilityCatalog } : {}),
});
await runner.promise;
