/**
 * @donna/policy
 *
 * Deterministic, server-enforced permission and approval engine (Technical
 * Plan §6, Build Bible V2-009). Pure functions over typed, trusted input:
 * prompts and external/model content never reach these decisions and can never
 * grant authority (Build Bible V2-023). Approval gates and the never-autonomous
 * rule cannot be bypassed by model reasoning.
 */
export * from './types.js';
export * from './roles.js';
export * from './kill-switches.js';
export * from './engine.js';
export * from './approval.js';
