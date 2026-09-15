/**
 * @donna/adapter-http
 *
 * A real HTTP `CapabilityAdapter` (Technical Plan §7) — the `automation`
 * execution class. Bound to a fixed base URL (SSRF-safe), auth from the
 * environment, HTTP failures mapped into the shared error taxonomy. The base for
 * concrete REST integrations (GHL, Apollo, …).
 */
export * from './http-adapter.js';
