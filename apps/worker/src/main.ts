import { createServer } from 'node:http';

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

// Liveness endpoint. The worker has no HTTP API, but a platform healthcheck
// (Railway) needs a port to probe; it starts only when `PORT` is provided by the
// host, so a local `node dist/main.js` never binds a port. Reaching this line
// means the queue runner started, so the process is healthy.
const healthPort = process.env.PORT;
if (healthPort !== undefined && healthPort !== '') {
  createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
  }).listen(Number(healthPort), '0.0.0.0');
}

await runner.promise;
