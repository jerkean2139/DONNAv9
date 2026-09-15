/**
 * @donna/work-router
 *
 * The Work Router (Technical Plan §1.2/§4, Build Bible V2-006). It decides
 * whether work goes to deterministic software, automation, a human, a
 * browser/coding agent, or AI — BEFORE any model is chosen. Pure, deterministic
 * logic over a capability registry; depends only on `@donna/core-domain` and the
 * adapter contracts.
 */
export * from './registry.js';
export * from './router.js';
