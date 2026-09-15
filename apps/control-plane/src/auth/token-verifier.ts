import { jwtVerify, type JWTPayload, type JWTVerifyGetKey, type KeyLike } from 'jose';

/** Raised when a bearer token fails signature/issuer/audience/expiry checks. */
export class TokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

/** Raised when a valid token has not satisfied the required MFA claim. */
export class MfaRequiredError extends Error {
  constructor() {
    super('multi-factor authentication required');
    this.name = 'MfaRequiredError';
  }
}

export interface VerifierConfig {
  /**
   * The verification key — a `createRemoteJWKSet(new URL(jwksUrl))` for a hosted
   * provider (Clerk/Auth0/…), or a static key/JWKS function in tests. Provider
   * choice is config, not code.
   */
  readonly key: KeyLike | Uint8Array | JWTVerifyGetKey;
  readonly issuer?: string;
  readonly audience?: string;
  /** Enforce MFA: the token must carry the MFA claim server-side (doc 06/10). */
  readonly requireMfa?: boolean;
  /** Claim that signals MFA was satisfied (default `mfa`; Clerk maps this via a session-token template). */
  readonly mfaClaim?: string;
  /** Exact value the MFA claim must equal; when unset, any truthy value passes. */
  readonly mfaValue?: string;
}

export interface VerifiedIdentity {
  /** The provider subject id (e.g. Clerk `sub`) — the stable external user id. */
  readonly subject: string;
  readonly email?: string;
  readonly claims: JWTPayload;
}

function mfaSatisfied(config: VerifierConfig, claims: JWTPayload): boolean {
  const raw = claims[config.mfaClaim ?? 'mfa'];
  if (config.mfaValue !== undefined) return raw === config.mfaValue;
  return raw === true || raw === 'true' || raw === 1;
}

/**
 * Verify a bearer JWT and extract the identity (Technical Plan §6/§8). The
 * signature, issuer, audience and expiry are checked by `jose`; MFA is enforced
 * as a server-side claim check when configured — the token is trusted only after
 * this passes. Provider-agnostic: any OIDC/JWT issuer works by pointing `key` at
 * its JWKS. Login and MFA themselves are owned by the provider (Clerk).
 */
export async function verifyToken(
  token: string,
  config: VerifierConfig,
): Promise<VerifiedIdentity> {
  const options = {
    ...(config.issuer !== undefined ? { issuer: config.issuer } : {}),
    ...(config.audience !== undefined ? { audience: config.audience } : {}),
  };
  let payload: JWTPayload;
  try {
    // Branch so TS picks the right overload: a JWKS getKey function vs a key.
    const result =
      typeof config.key === 'function'
        ? await jwtVerify(token, config.key, options)
        : await jwtVerify(token, config.key, options);
    payload = result.payload;
  } catch (error) {
    throw new TokenInvalidError(
      error instanceof Error ? error.message : 'token verification failed',
    );
  }

  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new TokenInvalidError('token has no subject');
  }
  if (config.requireMfa === true && !mfaSatisfied(config, payload)) {
    throw new MfaRequiredError();
  }

  return {
    subject: payload.sub,
    ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
    claims: payload,
  };
}
