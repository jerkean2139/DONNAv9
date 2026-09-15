import { createDatabase, type DonnaDatabase } from '@donna/db';
import { InMemoryEventBus } from '@donna/events';
import { runMigrations } from 'graphile-worker';
import { createRemoteJWKSet } from 'jose';

import { devAuthenticator, jwtAuthenticator, type Authenticator } from './auth/authenticate.js';
import { DrizzlePrincipalResolver } from './auth/principal-resolver.js';
import { verifyToken, type VerifierConfig } from './auth/token-verifier.js';
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
 * Build the request authenticator (Technical Plan §6/§8). When `AUTH_JWKS_URL`
 * is set (and a database is available for the principal lookup), production JWT
 * auth is used: the provider (Clerk) owns login + MFA, we verify the token and
 * derive the principal from our tables. Otherwise the dev header shim, with a
 * loud warning — never rely on it in production. Secrets/URLs come from the
 * environment, never source.
 */
function buildAuthenticator(db: DonnaDatabase | undefined): Authenticator {
  const jwksUrl = process.env.AUTH_JWKS_URL;
  if (jwksUrl === undefined || jwksUrl === '' || db === undefined) {
    console.warn('AUTH_JWKS_URL not set — using the dev header shim (NOT production auth).');
    return devAuthenticator();
  }
  const config: VerifierConfig = {
    key: createRemoteJWKSet(new URL(jwksUrl)),
    ...(process.env.AUTH_ISSUER !== undefined ? { issuer: process.env.AUTH_ISSUER } : {}),
    ...(process.env.AUTH_AUDIENCE !== undefined ? { audience: process.env.AUTH_AUDIENCE } : {}),
    requireMfa: process.env.AUTH_REQUIRE_MFA === 'true',
    ...(process.env.AUTH_MFA_CLAIM !== undefined ? { mfaClaim: process.env.AUTH_MFA_CLAIM } : {}),
  };
  return jwtAuthenticator({
    verify: (token) => verifyToken(token, config),
    resolver: new DrizzlePrincipalResolver(db),
  });
}

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
    authenticate: buildAuthenticator(db),
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
    authenticate: buildAuthenticator(undefined),
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
