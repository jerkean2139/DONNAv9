/**
 * @donna/events
 *
 * Typed event construction, a transport-agnostic event bus, and the
 * transactional-outbox pattern (Technical Plan §4.2/§5). Depends only on
 * `@donna/core-domain`; the Postgres-backed transport and outbox store are
 * added as adapters later without changing consumers.
 */
export * from './create-event.js';
export * from './bus.js';
export * from './outbox.js';
