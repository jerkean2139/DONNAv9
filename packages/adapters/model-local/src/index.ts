/**
 * @donna/adapter-local
 *
 * Local (self-hosted, OpenAI-compatible) implementation of the `ModelAdapter`
 * contract (Technical Plan §7/§9). It composes `@donna/adapter-openai` pointed at
 * a local endpoint — no duplicated SDK integration — and carries the `local:` id
 * prefix so the Model Router can honor privacy-constrained routing. The endpoint
 * URL comes from the environment / composition root, never from source.
 */
export * from './local-adapter.js';
