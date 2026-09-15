# @donna/model-router

The **Model Router** (Technical Plan §10, Build Bible V2 doc 12). Invoked **only
after** the Work Router decides AI is the right execution class (V2-006).

`routeModel(input, registry)` returns `{ model, fallbacks[], reason }` (or `null`
if nothing eligible can meet the tier). It:

- filters the registry by **capability** (tools/vision), **privacy**
  (`requireLocal` → local nodes only), **context window**, **availability**, and
  excluded providers (the orchestrator's fallback step);
- picks the **cheapest** model whose reasoning `tierRange` covers the requested
  tier (cost-quality frontier); if none covers it exactly, **escalates** to the
  cheapest model capable of at least that tier;
- returns the remaining eligible models as an ordered **fallback/escalation
  chain**, cheapest first.

Model ids and pricing come from `@donna/config` (data, not architecture). The
concrete Anthropic/OpenAI/local `ModelAdapter` implementations land next
(they need provider keys/nodes and can't run in unit CI).
