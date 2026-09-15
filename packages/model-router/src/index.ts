/**
 * @donna/model-router
 *
 * The Model Router (Technical Plan §10). Invoked only after the Work Router
 * selects an AI execution class; picks the lowest-cost model meeting the tier,
 * capability, privacy, context and availability constraints, with an ordered
 * fallback chain. Reads the model registry from `@donna/config`; no SDKs.
 */
export * from './router.js';
