import { runDrizzleMigrations } from '../migrate.js';

/**
 * CLI entrypoint for an explicit release-phase migration (e.g. a Railway
 * pre-deploy command: `node dist/bin/migrate.js`). Reads `DATABASE_URL` from the
 * environment / secrets manager, never source (§8). Boot-time migration in the
 * control-plane makes this optional, but it is here for deploys that prefer to
 * migrate before the new release goes live.
 */
const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

try {
  await runDrizzleMigrations(connectionString);
  console.log('Application schema migrations applied.');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
