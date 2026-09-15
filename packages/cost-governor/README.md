# @donna/cost-governor

Budgets, cost estimation, the usage ledger, and cost/quality telemetry
(Technical Plan §11, Build Bible V2-012). Pure logic; no I/O, no SDKs.

- **`estimateCostUsd(model, usage)`** — prices uncached input, cached input (at
  the model's cache-read rate), and output tokens.
- **`checkBudget(budget, spent, estimate)`** — deterministic budget gate at
  organization / project / user / objective / task / provider / model scope; the
  Cost Governor calls it before dispatching an AI call.
- **`UsageLedger`** — records actual spend; totals with optional filtering.
- **`summarizeByModel(evaluations)`** — acceptance rate, avg cost and avg quality
  per model, so the Model Router can learn the empirical cost-quality frontier.

The persistent ledger/evaluations are backed by the DB `usage_ledger` /
`model_evaluation` tables; these functions operate over the loaded rows.
