# @donna/config

Configuration **data** for DONNA V2 (Technical Plan §12/§14). No I/O, no SDKs.

- **`MODEL_REGISTRY`** — model entries (id, provider, context window, input/output/
  cached pricing, capabilities, reasoning `tierRange`, privacy, availability).
  **Model ids and pricing are data, not architecture** (Build Bible V2 doc 12) —
  the Model Router reads this and it is expected to change. Anthropic ids/prices
  are current as of 2026-06; OpenAI and local entries are placeholders pending
  Jeremy's confirmation of the approved model pool + budgets (§22 item 7).
- **`isFeatureEnabled(flag, ctx)`** — deterministic feature-flag evaluation for
  staged rollout (V2-024); allow-lists override the global enabled bit.
