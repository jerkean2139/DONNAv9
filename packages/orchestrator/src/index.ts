/**
 * @donna/orchestrator
 *
 * The control-plane spine (Technical Plan §1.2/§4). Runs a work order through the
 * deterministic policy gate → Work Router → Model Router → adapter (with
 * fallback) → cost ledger, emitting an event at every material transition. The
 * orchestrator owns durable transitions; the model is one replaceable capability
 * behind an adapter. No provider SDKs — vendors are injected.
 */
export * from './work-order.js';
export * from './orchestrator.js';
export * from './capability-catalog.js';
