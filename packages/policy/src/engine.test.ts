import { AUTHORITY_LEVELS } from '@donna/core-domain';
import { describe, expect, it } from 'vitest';

import { evaluate } from './engine.js';
import type {
  ActionDescriptor,
  KillSwitchState,
  PrincipalContext,
  ResourceDescriptor,
} from './types.js';

function principal(overrides: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    userId: 'u1',
    organizationId: 'org1',
    role: 'team_member',
    actorKind: 'agent',
    teamIds: ['teamA'],
    projectIds: ['projX'],
    ...overrides,
  };
}

function action(overrides: Partial<ActionDescriptor> = {}): ActionDescriptor {
  return {
    name: 'test.action',
    authorityLevel: AUTHORITY_LEVELS.OBSERVE,
    sideEffecting: false,
    ...overrides,
  };
}

function resource(overrides: Partial<ResourceDescriptor> = {}): ResourceDescriptor {
  return { organizationId: 'org1', scope: 'ORGANIZATION', ...overrides };
}

describe('tenant isolation', () => {
  it('denies cross-organization access', () => {
    const d = evaluate({
      principal: principal(),
      action: action(),
      resource: resource({ organizationId: 'org2' }),
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('cross_tenant');
  });
});

describe('scope access', () => {
  it('allows org members to read org-scoped resources', () => {
    expect(
      evaluate({ principal: principal(), action: action(), resource: resource() }).effect,
    ).toBe('allow');
  });

  it('denies team resources to non-members', () => {
    const d = evaluate({
      principal: principal({ teamIds: [] }),
      action: action(),
      resource: resource({ scope: 'TEAM', teamId: 'teamA' }),
    });
    expect(d.reason).toBe('scope_denied');
  });

  it('allows team members', () => {
    const d = evaluate({
      principal: principal({ teamIds: ['teamA'] }),
      action: action(),
      resource: resource({ scope: 'TEAM', teamId: 'teamA' }),
    });
    expect(d.effect).toBe('allow');
  });

  it('keeps private context owner-only, even for an admin', () => {
    const d = evaluate({
      principal: principal({ role: 'admin', userId: 'admin1' }),
      action: action(),
      resource: resource({ scope: 'PRIVATE', ownerUserId: 'someone_else' }),
    });
    expect(d.effect).toBe('deny');
    expect(d.reason).toBe('scope_denied');
  });

  it('allows the private owner', () => {
    const d = evaluate({
      principal: principal({ userId: 'u1' }),
      action: action(),
      resource: resource({ scope: 'PRIVATE', ownerUserId: 'u1' }),
    });
    expect(d.effect).toBe('allow');
  });
});

describe('kill switches', () => {
  const killed: KillSwitchState = { globalPause: false, disabledCapabilities: ['outbound_comms'] };

  it('blocks a side-effecting action in a disabled capability', () => {
    const d = evaluate({
      principal: principal({ role: 'owner' }),
      action: action({
        sideEffecting: true,
        capability: 'outbound_comms',
        authorityLevel: AUTHORITY_LEVELS.ROUTINE_ACTION,
      }),
      resource: resource(),
      killSwitches: killed,
    });
    expect(d.reason).toBe('kill_switch');
  });

  it('still allows reads while paused globally', () => {
    const d = evaluate({
      principal: principal(),
      action: action({ sideEffecting: false }),
      resource: resource(),
      killSwitches: { globalPause: true, disabledCapabilities: [] },
    });
    expect(d.effect).toBe('allow');
  });
});

describe('authority ceiling', () => {
  it('denies actions above the role ceiling', () => {
    const d = evaluate({
      principal: principal({ role: 'contractor' }), // ceiling: PREPARE (1)
      action: action({ authorityLevel: AUTHORITY_LEVELS.ROUTINE_ACTION }),
      resource: resource(),
    });
    expect(d.reason).toBe('insufficient_authority');
  });

  it('allows routine actions for a team member', () => {
    const d = evaluate({
      principal: principal({ role: 'team_member' }),
      action: action({ authorityLevel: AUTHORITY_LEVELS.ROUTINE_ACTION }),
      resource: resource(),
    });
    expect(d.effect).toBe('allow');
  });
});

describe('approval gate', () => {
  it('requires approval for level-3 actions within the ceiling', () => {
    const d = evaluate({
      principal: principal({ role: 'executive' }),
      action: action({ authorityLevel: AUTHORITY_LEVELS.APPROVAL_REQUIRED }),
      resource: resource(),
    });
    expect(d.effect).toBe('requires_approval');
    expect(d.reason).toBe('approval_required');
  });
});

describe('never autonomous', () => {
  const neverAction = action({ authorityLevel: AUTHORITY_LEVELS.NEVER_AUTONOMOUS });

  it('denies an agent', () => {
    const d = evaluate({
      principal: principal({ role: 'owner', actorKind: 'agent' }),
      action: neverAction,
      resource: resource(),
    });
    expect(d.reason).toBe('never_autonomous');
  });

  it('allows a human owner', () => {
    const d = evaluate({
      principal: principal({ role: 'owner', actorKind: 'human' }),
      action: neverAction,
      resource: resource(),
    });
    expect(d.effect).toBe('allow');
  });
});
