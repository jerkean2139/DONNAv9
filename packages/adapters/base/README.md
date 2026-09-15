# @donna/adapter-base

Stable capability + model adapter contracts (Technical Plan §7, Build Bible
doc 09) — the **provider-independence boundary**. Feature and orchestration code
depends on these interfaces; only concrete adapters under `packages/adapters/*`
import vendor SDKs (enforced in CI), so any single model/browser/memory provider
stays replaceable (V2-007).

## Contracts

- **`CapabilityAdapter<TInput, TResult>`** — every external execution engine
  (API, automation, browser, coding agent, model): `capabilities()`, `health()`,
  `estimate()`, `execute()` (honors the idempotency key), `reportUsage()`,
  `classifyError()`, optional `cancel()`.
- **`ModelAdapter`** — extends the base with `modelCapabilities()` and normalized
  `ModelRequest`/`ModelResult`/`ModelUsage`. Business logic never branches on the
  vendor; that lives inside a concrete adapter.
- Normalized `HealthStatus`, `ErrorClass`, `CostEstimate`, `UsageRecord` so the
  orchestrator owns retry/fallback centrally.

## Helpers

`worstHealth()` aggregates several backends to their weakest link; `isRetryable()`
says whether a failure class warrants retry/fallback (transient/rate-limit/
unavailable) vs a hard stop (deterministic/auth).
