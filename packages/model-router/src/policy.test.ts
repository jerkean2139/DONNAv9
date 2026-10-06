import { describe, expect, it } from 'vitest';

import { BASELINE_ROUTE_POLICY, MAXIMUM_LOGIC_ROUTE_POLICY, selectRoutePolicy } from './policy.js';

describe('selectRoutePolicy', () => {
  it('keeps a 0% canary on baseline', () => {
    expect(
      selectRoutePolicy({ organizationId: 'org1', taskId: 't1', maximumLogicPercent: 0 }),
    ).toBe(BASELINE_ROUTE_POLICY);
  });

  it('puts a 100% canary on Maximum Logic', () => {
    expect(
      selectRoutePolicy({ organizationId: 'org1', taskId: 't1', maximumLogicPercent: 100 }),
    ).toBe(MAXIMUM_LOGIC_ROUTE_POLICY);
  });

  it('honors an explicit policy override', () => {
    expect(
      selectRoutePolicy({
        organizationId: 'org1',
        maximumLogicPercent: 100,
        forcePolicy: BASELINE_ROUTE_POLICY,
      }),
    ).toBe(BASELINE_ROUTE_POLICY);
  });

  it('assigns the same identity deterministically', () => {
    const input = {
      organizationId: 'org1',
      taskId: 'task-42',
      correlationId: 'corr-42',
      maximumLogicPercent: 20,
    } as const;

    expect(selectRoutePolicy(input)).toBe(selectRoutePolicy(input));
  });

  it('clamps rollout percentages safely', () => {
    expect(selectRoutePolicy({ organizationId: 'org1', maximumLogicPercent: -50 })).toBe(
      BASELINE_ROUTE_POLICY,
    );
    expect(selectRoutePolicy({ organizationId: 'org1', maximumLogicPercent: 500 })).toBe(
      MAXIMUM_LOGIC_ROUTE_POLICY,
    );
  });
});
