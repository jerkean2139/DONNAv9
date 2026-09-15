import { describe, expect, it } from 'vitest';

import { buildContextPacket, type ContextItem } from './packet.js';

function item(over: Partial<ContextItem> & Pick<ContextItem, 'id'>): ContextItem {
  return { priority: 1, tokens: 100, cacheTier: 'DYNAMIC', ...over };
}

describe('buildContextPacket', () => {
  it('includes everything when it fits the budget', () => {
    const packet = buildContextPacket([item({ id: 'a' }), item({ id: 'b' })], 1000);
    expect(packet.items).toHaveLength(2);
    expect(packet.totalTokens).toBe(200);
    expect(packet.dropped).toHaveLength(0);
  });

  it('selects higher-priority items first and drops the rest under budget', () => {
    const items = [
      item({ id: 'low', priority: 1, tokens: 100 }),
      item({ id: 'high', priority: 10, tokens: 100 }),
      item({ id: 'mid', priority: 5, tokens: 100 }),
    ];
    const packet = buildContextPacket(items, 200);
    const ids = packet.items.map((i) => i.id);
    expect(ids).toContain('high');
    expect(ids).toContain('mid');
    expect(packet.dropped.map((i) => i.id)).toEqual(['low']);
    expect(packet.totalTokens).toBe(200);
  });

  it('orders selected items by cache tier (STATIC → SEMI_STABLE → DYNAMIC)', () => {
    const items = [
      item({ id: 'dyn', priority: 9, cacheTier: 'DYNAMIC' }),
      item({ id: 'stat', priority: 1, cacheTier: 'STATIC' }),
      item({ id: 'semi', priority: 5, cacheTier: 'SEMI_STABLE' }),
    ];
    const packet = buildContextPacket(items, 1000);
    expect(packet.items.map((i) => i.id)).toEqual(['stat', 'semi', 'dyn']);
  });

  it('never exceeds the token budget', () => {
    const items = Array.from({ length: 10 }, (_, n) => item({ id: `i${n}`, tokens: 100 }));
    const packet = buildContextPacket(items, 350);
    expect(packet.totalTokens).toBeLessThanOrEqual(350);
    expect(packet.items).toHaveLength(3);
    expect(packet.dropped).toHaveLength(7);
  });
});
