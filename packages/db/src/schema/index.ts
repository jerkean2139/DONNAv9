/**
 * DONNA V2 authoritative relational schema (Technical Plan §3).
 *
 * Postgres is the source of truth for business/product state. Semantic/vector
 * data (added in Phase 6) is an index over this state, never the system of
 * record (Build Bible V2-005).
 */
export * from './enums.js';
export * from './tenancy.js';
export * from './execution.js';
export * from './governance.js';
export * from './business-graph.js';
