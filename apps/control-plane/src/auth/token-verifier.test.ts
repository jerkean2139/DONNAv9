import { generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { MfaRequiredError, TokenInvalidError, verifyToken } from './token-verifier.js';

const ISSUER = 'https://clerk.test';
let publicKey: KeyLike;
let privateKey: KeyLike;

async function sign(
  claims: Record<string, unknown>,
  opts: { issuer?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('user_123')
    .setIssuer(opts.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
});

describe('verifyToken', () => {
  it('accepts a valid token and extracts the identity', async () => {
    const token = await sign({ email: 'j@x.com' });
    const identity = await verifyToken(token, { key: publicKey, issuer: ISSUER });
    expect(identity.subject).toBe('user_123');
    expect(identity.email).toBe('j@x.com');
  });

  it('rejects a token from the wrong issuer', async () => {
    const token = await sign({}, { issuer: 'https://evil.test' });
    await expect(verifyToken(token, { key: publicKey, issuer: ISSUER })).rejects.toBeInstanceOf(
      TokenInvalidError,
    );
  });

  it('rejects a garbage token', async () => {
    await expect(verifyToken('not.a.jwt', { key: publicKey })).rejects.toBeInstanceOf(
      TokenInvalidError,
    );
  });

  it('requires MFA when configured and the claim is absent', async () => {
    const token = await sign({});
    await expect(
      verifyToken(token, { key: publicKey, issuer: ISSUER, requireMfa: true }),
    ).rejects.toBeInstanceOf(MfaRequiredError);
  });

  it('passes MFA when the claim is satisfied', async () => {
    const token = await sign({ mfa: true });
    const identity = await verifyToken(token, {
      key: publicKey,
      issuer: ISSUER,
      requireMfa: true,
    });
    expect(identity.subject).toBe('user_123');
  });

  it('honors a custom MFA claim name and value', async () => {
    const token = await sign({ aal: 'aal2' });
    const identity = await verifyToken(token, {
      key: publicKey,
      requireMfa: true,
      mfaClaim: 'aal',
      mfaValue: 'aal2',
    });
    expect(identity.subject).toBe('user_123');
  });
});
