/**
 * Context Packet builder (Technical Plan §12, Build Bible doc 05). Assembles the
 * temporary working context for one objective/task under a per-task token budget
 * — never send the entire company history by default. Selects by priority, then
 * orders by cache tier so the provider prompt maximizes safe cache reuse (STATIC
 * first, DYNAMIC last).
 */

/** Cache tiers (Technical Plan §12): stable content first for cache reuse. */
export const CACHE_TIERS = ['STATIC', 'SEMI_STABLE', 'DYNAMIC'] as const;
export type CacheTier = (typeof CACHE_TIERS)[number];

const TIER_ORDER: Record<CacheTier, number> = { STATIC: 0, SEMI_STABLE: 1, DYNAMIC: 2 };

export interface ContextItem {
  readonly id: string;
  /** Higher is more important; selected first under the budget. */
  readonly priority: number;
  readonly tokens: number;
  readonly cacheTier: CacheTier;
  readonly content?: unknown;
}

export interface ContextPacket {
  /** Selected items, ordered for cache reuse (STATIC → SEMI_STABLE → DYNAMIC). */
  readonly items: readonly ContextItem[];
  readonly totalTokens: number;
  readonly budgetTokens: number;
  /** Items that did not fit the budget (lowest priority dropped first). */
  readonly dropped: readonly ContextItem[];
}

/**
 * Build a packet: greedily include items by descending priority while they fit
 * the token budget, then order the selected items by cache tier. Records what was
 * dropped so the caller can report it (Technical Plan §12 — record what context
 * was included).
 */
export function buildContextPacket(
  items: readonly ContextItem[],
  budgetTokens: number,
): ContextPacket {
  const byPriority = [...items].sort((a, b) => b.priority - a.priority);

  const selected: ContextItem[] = [];
  const dropped: ContextItem[] = [];
  let used = 0;
  for (const item of byPriority) {
    if (used + item.tokens <= budgetTokens) {
      selected.push(item);
      used += item.tokens;
    } else {
      dropped.push(item);
    }
  }

  selected.sort(
    (a, b) => TIER_ORDER[a.cacheTier] - TIER_ORDER[b.cacheTier] || b.priority - a.priority,
  );

  return { items: selected, totalTokens: used, budgetTokens, dropped };
}
