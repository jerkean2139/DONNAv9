/**
 * @donna/adapter-capability-fn
 *
 * The deterministic in-process capability adapter (Technical Plan §7). Adapts a
 * plain handler to the `CapabilityAdapter` contract so the orchestrator can run
 * deterministic work — the `deterministic` execution class the Work Router
 * prefers over any AI path. No provider SDK.
 */
export * from './function-adapter.js';
