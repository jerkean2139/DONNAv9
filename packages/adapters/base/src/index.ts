/**
 * @donna/adapter-base
 *
 * Stable capability + model adapter contracts (Technical Plan §7). The
 * provider-independence boundary: feature code depends on these interfaces;
 * only `packages/adapters/*` implementations touch vendor SDKs.
 */
export * from './contracts.js';
export * from './health.js';
