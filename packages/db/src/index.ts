/**
 * @donna/db
 *
 * Authoritative relational schema (Drizzle) and a thin client factory for the
 * DONNA V2 control plane. Repositories and query logic are added by the
 * services that own them (control-plane API, worker) in later Phase 1 work.
 */
export * as schema from './schema/index.js';
export { createDatabase, type DonnaDatabase } from './client.js';
