import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema/index.js';

/**
 * Absolute path to the committed SQL migrations. Resolved from this module's own
 * location so it works whether run from source or from `dist/` — the folder is a
 * sibling of the compiled output and ships with the package.
 */
export const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

/**
 * Apply the DONNA application schema (Drizzle) to a database, idempotently.
 *
 * This is the RUNTIME migrator — it uses `drizzle-orm` (a production dependency),
 * not the `drizzle-kit` CLI (a dev dependency), so it runs in a deployed image
 * where devDependencies may be pruned. Drizzle records applied migrations in its
 * own table, so re-running is a no-op. The control-plane calls this on boot, so
 * a deploy with `DATABASE_URL` set fully prepares the database with no terminal
 * step (Technical Plan §8/§16); it is also exposed as the `db:deploy` script for
 * an explicit release-phase run.
 *
 * The graphile-worker queue schema is applied separately by the control-plane on
 * boot; this function owns only the application schema.
 */
export async function runDrizzleMigrations(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1, prepare: false });
  try {
    await migrate(drizzle(sql, { schema }), { migrationsFolder });
  } finally {
    await sql.end();
  }
}
