import { GhlCapabilityAdapter } from '@donna/adapter-ghl';
import { CapabilityCatalog } from '@donna/orchestrator';

/**
 * Build the worker's non-AI capability catalog from the environment (the
 * composition root — §8). Each capability is registered only when its
 * credentials are present, so a deployment without them simply routes that class
 * to a human instead of crashing. The catalog feeds BOTH the Work Router registry
 * and the capability-adapter resolver, so routing and execution cannot drift.
 *
 * Returns `undefined` when nothing is configured, so the worker keeps its
 * empty-catalog default (non-AI classes park as `blocked`).
 */
export function buildCapabilityCatalog(
  env: Record<string, string | undefined> = process.env,
): CapabilityCatalog | undefined {
  const catalog = new CapabilityCatalog();
  let configured = false;

  const ghlToken = env['GHL_TOKEN'];
  if (ghlToken !== undefined && ghlToken !== '') {
    const locationId = env['GHL_LOCATION_ID'];
    catalog.register(
      new GhlCapabilityAdapter({
        token: ghlToken,
        ...(locationId !== undefined && locationId !== '' ? { locationId } : {}),
      }),
      'automation',
      { provides: ['crm'] },
    );
    configured = true;
  }

  return configured ? catalog : undefined;
}
