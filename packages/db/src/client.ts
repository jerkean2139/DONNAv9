import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

export type DonnaDatabase = ReturnType<typeof createDatabase>;

/**
 * Create a Drizzle client bound to the DONNA schema.
 *
 * The connection string comes from the caller (never hard-coded); secrets live
 * in the environment/secrets manager, not in source (Technical Plan §8). This
 * is a thin factory — no queries or business logic live here.
 */
export function createDatabase(connectionString: string) {
  const sql = postgres(connectionString, { prepare: false });
  return drizzle(sql, { schema });
}
