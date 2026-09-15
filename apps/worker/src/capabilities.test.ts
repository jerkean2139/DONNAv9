import { describe, expect, it } from 'vitest';

import { buildCapabilityCatalog } from './capabilities.js';

describe('buildCapabilityCatalog', () => {
  it('returns undefined when nothing is configured', () => {
    expect(buildCapabilityCatalog({})).toBeUndefined();
  });

  it('registers GHL as an automation capability when GHL_TOKEN is set', () => {
    const catalog = buildCapabilityCatalog({ GHL_TOKEN: 'tok', GHL_LOCATION_ID: 'loc1' });
    expect(catalog).toBeDefined();

    // The Work Router registry sees a healthy CRM capability…
    const registry = catalog!.toWorkRegistry();
    const providers = registry.healthyProviding(['crm']);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.executionClass).toBe('automation');

    // …and its adapter resolves by the same id.
    const adapter = catalog!.resolver()(providers[0]!.id);
    expect(adapter).toBeDefined();
    expect(adapter?.capabilities().capabilities).toContain('crm');
  });
});
