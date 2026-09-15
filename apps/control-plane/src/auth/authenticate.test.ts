import type { PrincipalContext } from '@donna/policy';
import { describe, expect, it } from 'vitest';

import { devAuthenticator, jwtAuthenticator } from './authenticate.js';
import type { PrincipalResolver } from './principal-resolver.js';
import { MfaRequiredError, TokenInvalidError, type VerifiedIdentity } from './token-verifier.js';

const principal: PrincipalContext = {
  userId: 'u1',
  organizationId: 'org1',
  role: 'owner',
  actorKind: 'human',
  teamIds: [],
  projectIds: [],
};

const resolverFor = (result: PrincipalContext | null): PrincipalResolver => ({
  resolve: () => Promise.resolve(result),
});

const bearer = { authorization: 'Bearer good.token' };

describe('devAuthenticator', () => {
  it('accepts the header shim', async () => {
    const out = await devAuthenticator()({
      'x-donna-user-id': 'u1',
      'x-donna-org-id': 'org1',
      'x-donna-role': 'owner',
    });
    // The dev shim defaults actorKind to 'agent' when the header is absent.
    expect(out).toEqual({ ok: true, principal: { ...principal, actorKind: 'agent' } });
  });

  it('refuses when no identity headers are present', async () => {
    const out = await devAuthenticator()({});
    expect(out).toEqual({ ok: false, status: 401, error: 'unauthenticated' });
  });
});

describe('jwtAuthenticator', () => {
  const identity: VerifiedIdentity = { subject: 'user_123', claims: { sub: 'user_123' } };

  it('401s when the bearer token is missing', async () => {
    const auth = jwtAuthenticator({
      verify: () => Promise.resolve(identity),
      resolver: resolverFor(principal),
    });
    expect(await auth({})).toEqual({ ok: false, status: 401, error: 'missing_bearer_token' });
  });

  it('401s on an invalid token', async () => {
    const auth = jwtAuthenticator({
      verify: () => Promise.reject(new TokenInvalidError('bad')),
      resolver: resolverFor(principal),
    });
    expect(await auth(bearer)).toEqual({ ok: false, status: 401, error: 'invalid_token' });
  });

  it('403s mfa_required when MFA is unsatisfied', async () => {
    const auth = jwtAuthenticator({
      verify: () => Promise.reject(new MfaRequiredError()),
      resolver: resolverFor(principal),
    });
    expect(await auth(bearer)).toEqual({ ok: false, status: 403, error: 'mfa_required' });
  });

  it('403s no_account when the token is valid but the user is not provisioned', async () => {
    const auth = jwtAuthenticator({
      verify: () => Promise.resolve(identity),
      resolver: resolverFor(null),
    });
    expect(await auth(bearer)).toEqual({ ok: false, status: 403, error: 'no_account' });
  });

  it('returns the resolved principal on success', async () => {
    const auth = jwtAuthenticator({
      verify: () => Promise.resolve(identity),
      resolver: resolverFor(principal),
    });
    expect(await auth(bearer)).toEqual({ ok: true, principal });
  });
});
