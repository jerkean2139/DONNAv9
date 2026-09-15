# @donna/orchestrator

The **control-plane spine** (Technical Plan §1.2/§4, Build Bible V2: "Donna is
not an LLM"). It runs one **work order** through the deterministic decision
chain and owns the durable transitions; the model is one replaceable capability
behind an adapter, never the decision-maker.

## Control flow

`executeWorkOrder(order, deps)` runs the order through, emitting a typed event at
every material transition:

1. **Policy gate** — `@donna/policy` `evaluate()`. `deny` → `denied` (event
   `task.blocked`); `requires_approval` → `approval_required` (event
   `approval.requested`). Server-enforced and never bypassable by model
   reasoning.
2. **Work Router** — `@donna/work-router` `routeWork()` picks the execution
   class _before_ any model is chosen (event `task.planned`). `human` parks as
   `awaiting_human`; a non-AI class with no wired capability adapter parks as
   `blocked` (`no_capability_adapter`).
3. **Model Router** — for an AI class, `@donna/model-router` `routeModel()`
   returns the model plus an ordered fallback chain. For each entry the
   orchestrator resolves a bound `ModelAdapter` (injected — no provider SDKs
   here), runs the pre-flight **budget** check (`@donna/cost-governor`
   `checkBudget` against the adapter's own estimate), executes, and records
   usage in the ledger (event `worker.started` → `tool.called` →
   `task.completed`). It falls through to the next model **only** on a retryable
   error (`isRetryable`); a deterministic error stops the chain (`task.failed`).

## Wiring

Vendors are resolved through `deps.resolveModelAdapter(modelId)`, so the
composition root binds concrete adapters and this package stays free of any
provider SDK. `OrchestratorDeps` also carries the event bus, the capability
registry, the model registry, and the usage ledger — all injected, all
replaceable.
