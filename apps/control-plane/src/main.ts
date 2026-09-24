import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabase, runDrizzleMigrations, type DonnaDatabase } from '@donna/db';
import { InMemoryEventBus } from '@donna/events';
import { runMigrations } from 'graphile-worker';
import { createRemoteJWKSet } from 'jose';

import { devAuthenticator, jwtAuthenticator, type Authenticator } from './auth/authenticate.js';
import { DrizzlePrincipalResolver } from './auth/principal-resolver.js';
import { verifyToken, type VerifierConfig } from './auth/token-verifier.js';
import {
  ensureDevWorkspace,
  inMemoryDevPrincipal,
  type DevPrincipal,
} from './dev/dev-workspace.js';
import { resolveStartupConfig, type StartupConfig } from './runtime-config.js';
import { buildServer, type ClientConfig, type ServerDeps } from './server.js';
import { DrizzleObjectiveService } from './services/drizzle-objective-service.js';
import { InMemoryObjectiveService } from './services/objective-service.js';
import {
  DrizzleTaskDispatcher,
  InMemoryTaskDispatcher,
  type TaskDispatcher,
} from './services/task-dispatcher.js';
import { InMemoryTaskService } from './services/task-service.js';
import { InMemoryWorkQueue } from './services/work-queue.js';
import { SvixWebhookVerifier } from './webhooks/clerk-verify.js';
import { DrizzleProvisioningService } from './webhooks/provisioning.js';

/**
 * Build the request authenticator (Technical Plan §6/§8). Production always
 * resolves to JWT verification (Clerk owns login + MFA; we verify the token and
 * derive the principal from our own tables) — the development header shim, which
 * trusts caller-supplied identity, is only ever selected outside production and
 * announces itself. Secrets/URLs come from the environment, never source.
 */
function buildAuthenticator(
  auth: StartupConfig['auth'],
  db: DonnaDatabase | undefined,
): Authenticator {
  if (auth.kind === 'dev-shim') {
    console.warn('Auth: using the development header shim (NOT production auth).');
    return devAuthenticator();
  }
  if (db === undefined) {
    // Unreachable: JWT auth is only selected when a database is available.
    throw new Error('JWT authentication requires a database for principal resolution.');
  }
  const config: VerifierConfig = {
    key: createRemoteJWKSet(new URL(auth.jwksUrl)),
    ...(auth.issuer !== undefined ? { issuer: auth.issuer } : {}),
    ...(auth.audience !== undefined ? { audience: auth.audience } : {}),
    requireMfa: auth.requireMfa,
    ...(auth.mfaClaim !== undefined ? { mfaClaim: auth.mfaClaim } : {}),
  };
  return jwtAuthenticator({
    verify: (token) => verifyToken(token, config),
    resolver: new DrizzlePrincipalResolver(db),
  });
}

/**
 * Process entrypoint. Resolve the startup configuration first and FAIL CLOSED:
 * in production, a missing required variable exits the process (naming the
 * variable, never its value) before the HTTP listener opens — the dev header
 * shim and the non-durable in-memory stores never back production (SEC-1). In
 * development/test the durable path is used when configured, otherwise the local
 * shim. Secrets come from the environment / secrets manager, never source (§8).
 */
const resolution = resolveStartupConfig(process.env);
if (!resolution.ok) {
  console.error(
    `Refusing to start in production: missing required configuration — ${resolution.missing.join(', ')}. ` +
      `Set these (see MANUAL-SETUP.md) or run with APP_ENV=development to use the local header shim.`,
  );
  process.exit(1);
}
const config = resolution.config;

let deps: ServerDeps;
// The dev-shim identity the web app uses (outside production only).
let devPrincipal: DevPrincipal | undefined;
if (config.databaseUrl !== undefined) {
  // Apply the schema on boot so a deploy with DATABASE_URL set fully prepares
  // the database with no terminal step (§16): the application schema (Drizzle)
  // and graphile-worker's queue schema, the latter so the dispatcher's
  // transactional `add_job` resolves even if the worker has not booted yet.
  await runDrizzleMigrations(config.databaseUrl);
  await runMigrations({ connectionString: config.databaseUrl });
  const db = createDatabase(config.databaseUrl);
  if (config.auth.kind === 'dev-shim') devPrincipal = await ensureDevWorkspace(db);
  deps = {
    objectiveService: new DrizzleObjectiveService(db),
    taskDispatcher: new DrizzleTaskDispatcher(db),
    authenticate: buildAuthenticator(config.auth, db),
    // In production the signing secret is required, so the provisioning webhook
    // is always wired; in development it is wired only when the secret is set.
    ...(config.webhookSecret !== undefined
      ? {
          clerkWebhook: {
            verifier: new SvixWebhookVerifier(config.webhookSecret),
            provisioning: new DrizzleProvisioningService(db),
          },
        }
      : {}),
  };
} else {
  // Only reachable outside production — production guarantees a database.
  console.warn('DATABASE_URL not set — using in-memory services (state is not durable).');
  if (config.auth.kind === 'dev-shim') devPrincipal = inMemoryDevPrincipal();
  const bus = new InMemoryEventBus();
  const taskService = new InMemoryTaskService(bus);
  const taskDispatcher: TaskDispatcher = new InMemoryTaskDispatcher(
    taskService,
    new InMemoryWorkQueue(),
  );
  deps = {
    objectiveService: new InMemoryObjectiveService(bus),
    taskDispatcher,
    authenticate: buildAuthenticator(config.auth, undefined),
  };
}

// What the web app needs to sign requests. Public values only.
const clerkPublishableKey = process.env['CLERK_PUBLISHABLE_KEY'];
const clerkJwtTemplate = process.env['CLERK_JWT_TEMPLATE'];
const clientConfig: ClientConfig =
  config.auth.kind === 'jwt'
    ? clerkPublishableKey !== undefined && clerkPublishableKey !== ''
      ? {
          auth: 'clerk',
          clerkPublishableKey,
          ...(clerkJwtTemplate !== undefined && clerkJwtTemplate !== ''
            ? { clerkJwtTemplate }
            : {}),
        }
      : { auth: 'unconfigured' }
    : devPrincipal !== undefined
      ? { auth: 'dev', devPrincipal }
      : { auth: 'unconfigured' };
if (clientConfig.auth === 'unconfigured') {
  console.warn('CLERK_PUBLISHABLE_KEY not set — the web app cannot sign users in.');
}
deps = { ...deps, clientConfig };

// Serve the built web app from the same service when it is present (the root
// build produces `apps/web/dist`), so the deployment URL shows the UI. Look
// relative to this file first, then to the working directory (repo root or the
// control-plane package, depending on how the start command is run).
const webCandidates = [
  process.env['WEB_DIST_DIR'],
  fileURLToPath(new URL('../../web/dist', import.meta.url)),
  resolve(process.cwd(), 'apps/web/dist'),
  resolve(process.cwd(), '../web/dist'),
].filter((p): p is string => p !== undefined && p !== '');
const webRoot = webCandidates.find((p) => existsSync(resolve(p, 'index.html')));
if (webRoot !== undefined) {
  console.log(`Serving the web app from ${webRoot}`);
  deps = { ...deps, webRoot };
} else {
  console.warn(
    `Web bundle not found (looked in: ${webCandidates.join(', ')}) — serving the API only.`,
  );
}

const app = buildServer(deps);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
