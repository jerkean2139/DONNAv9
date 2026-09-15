# @donna/context

The **Context Packet builder** (Technical Plan §12, Build Bible doc 05). Assembles
the temporary working context for one objective/task under a **per-task token
budget** — never send the entire company history by default.

`buildContextPacket(items, budgetTokens)`:

- selects items greedily by **descending priority** while they fit the budget;
- orders the selected items by **cache tier** (`STATIC → SEMI_STABLE → DYNAMIC`)
  so the provider prompt maximizes safe cache reuse (stable content first);
- records what was **dropped** so the caller can report what context was included.

Pure logic. The ranking inputs (identity/role, authoritative state, retrieved
knowledge/memory, required skill/SOP, recent events) are supplied by the
orchestrator's retrieval layer; source confidence and secrets policy are enforced
upstream (secrets never enter context — Technical Plan §8/§12).
