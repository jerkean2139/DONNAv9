# @donna/work-router

The **Work Router** (Technical Plan §1.2/§4, Build Bible V2-006). It sits
**above the Model Router**: it decides _whether_ work should be handled by
deterministic software, an existing automation, a human, a browser/coding
agent, or AI — before any model is chosen. Never invoke an LLM when
deterministic software or an automation suffices.

## How it decides

`routeWork(input, registry)` returns `{ executionClass, capabilityId?, reason }`,
deny-to-human-last and preference-ordered:

1. Task needs human judgment/ownership → `human`.
2. A healthy registered capability satisfies **all** required capabilities → pick
   the least-complex class (`deterministic` → `automation` → `human` → `browser`
   → `coding_agent` → `local_ai` → `cloud_ai`).
3. Nothing matches but reasoning is required → `cloud_ai` (coarse; the Model
   Router then selects the exact model/node — local vs cloud, tier, budget).
4. Otherwise → `human`.

`candidateClasses(input, registry)` returns the ordered fallback chain for the
orchestrator, always ending at a human.

Unhealthy/offline capabilities are excluded — online does not mean available
(Build Bible doc 11). Pure, deterministic logic; depends only on
`@donna/core-domain` and the adapter contracts. The persistent registry backed
by live adapter health lands with the orchestrator.
