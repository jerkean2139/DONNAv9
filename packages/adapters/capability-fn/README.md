# @donna/adapter-capability-fn

A deterministic, in-process `CapabilityAdapter` (Technical Plan §7) — the
`deterministic` execution class the Work Router prefers over any AI path
(Build Bible V2-006: never invoke an LLM when deterministic software suffices).

`FunctionCapabilityAdapter` adapts a plain handler to the adapter contract:

```ts
const sum = new FunctionCapabilityAdapter({
  id: 'math.sum',
  provides: ['math'],
  handler: (nums: number[]) => nums.reduce((a, b) => a + b, 0),
});
```

Register it in a `CapabilityCatalog` (`@donna/orchestrator`) with an execution
class; the catalog then feeds both the Work Router registry (routing) and the
orchestrator's capability resolver (execution) from one place. When the Work
Router matches the capability, the orchestrator runs `execute` and records usage
in the ledger — no model, no tokens.

- **Health / estimate** — always healthy; estimate defaults to $0 (`estimateUsd`
  overrides). Deterministic work is effectively free.
- **Errors** — a thrown handler error is classified `deterministic`
  (non-retryable): a bug in the work, not a transient fault, so the orchestrator
  does not retry it.
- **Idempotency** — the handler receives the `ExecutionContext`; honor
  `ctx.idempotencyKey` so retries never duplicate side effects.

No provider SDK and no I/O of its own — the handler does whatever deterministic
work the capability needs.
