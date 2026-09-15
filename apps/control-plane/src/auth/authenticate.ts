import type { PrincipalContext } from '@donna/policy';

import { devPrincipalFromHeaders } from '../principal.js';
import type { PrincipalResolver } from './principal-resolver.js';
import { MfaRequiredError, type VerifiedIdentity } from './token-verifier.js';

/** The outcome of authenticating a request: a trusted principal, or a refusal. */
export type AuthOutcome =
  | { readonly ok: true; readonly principal: PrincipalContext }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

/** Authenticate from request headers. Async because verification hits a JWKS. */
export type Authenticator = (headers: Record<string, unknown>) => Promise<AuthOutcome>;

function bearerToken(headers: Record<string, unknown>): string | null {
  const raw = headers['authorization'];
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (typeof value !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1] ?? null;
}

/**
 * Development authenticator — trusts the `x-donna-*` header shim. NOT production
 * auth; used only when no identity provider is configured (local/tests).
 */
export function devAuthenticator(): Authenticator {
  return (headers) => {
    const principal = devPrincipalFromHeaders(headers);
    return Promise.resolve<AuthOutcome>(
      principal === null
        ? { ok: false, status: 401, error: 'unauthenticated' }
        : { ok: true, principal },
    );
  };
}

export interface JwtAuthenticatorDeps {
  /** A bound verifier, e.g. `(t) => verifyToken(t, verifierConfig)`. */
  readonly verify: (token: string) => Promise<VerifiedIdentity>;
  readonly resolver: PrincipalResolver;
}

/**
 * Production authenticator (Technical Plan §6/§8): verify the bearer JWT (the
 * provider owns login + MFA), then resolve the trusted principal from OUR
 * database. A missing token is `401`; an invalid token is `401`; a token whose
 * MFA is unsatisfied is `403 mfa_required`; a valid token with no provisioned
 * user/membership is `403 no_account` (authenticated but not authorized).
 */
export function jwtAuthenticator(deps: JwtAuthenticatorDeps): Authenticator {
  return async (headers) => {
    const token = bearerToken(headers);
    if (token === null) return { ok: false, status: 401, error: 'missing_bearer_token' };

    let identity: VerifiedIdentity;
    try {
      identity = await deps.verify(token);
    } catch (error) {
      if (error instanceof MfaRequiredError)
        return { ok: false, status: 403, error: 'mfa_required' };
      return { ok: false, status: 401, error: 'invalid_token' };
    }

    const principal = await deps.resolver.resolve(identity);
    if (principal === null) return { ok: false, status: 403, error: 'no_account' };
    return { ok: true, principal };
  };
}
