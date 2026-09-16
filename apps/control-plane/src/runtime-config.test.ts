import { describe, expect, it } from 'vitest';

import { resolveAppEnv, resolveStartupConfig } from './runtime-config.js';

/** A complete, valid production environment. Individual tests remove one key. */
function prodEnv(): Record<string, string | undefined> {
  return {
    APP_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@h:5432/db',
    AUTH_JWKS_URL: 'https://app.clerk.accounts.dev/.well-known/jwks.json',
    AUTH_ISSUER: 'https://app.clerk.accounts.dev',
    AUTH_AUDIENCE: 'donna-api',
    AUTH_REQUIRE_MFA: 'true',
    CLERK_WEBHOOK_SECRET: 'whsec_test',
  };
}

describe('resolveAppEnv', () => {
  it('reads APP_ENV, then NODE_ENV', () => {
    expect(resolveAppEnv({ APP_ENV: 'development' })).toBe('development');
    expect(resolveAppEnv({ APP_ENV: 'dev' })).toBe('development');
    expect(resolveAppEnv({ APP_ENV: 'test' })).toBe('test');
    expect(resolveAppEnv({ NODE_ENV: 'development' })).toBe('development');
  });

  it('defaults unset or unrecognized to production (fail closed)', () => {
    expect(resolveAppEnv({})).toBe('production');
    expect(resolveAppEnv({ APP_ENV: 'staging' })).toBe('production');
    expect(resolveAppEnv({ APP_ENV: 'production' })).toBe('production');
  });
});

describe('resolveStartupConfig — production fails closed', () => {
  it('accepts a fully-configured production environment with JWT auth', () => {
    const res = resolveStartupConfig(prodEnv());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.appEnv).toBe('production');
    expect(res.config.databaseUrl).toBe('postgres://u:p@h:5432/db');
    expect(res.config.auth).toMatchObject({ kind: 'jwt', requireMfa: true });
    expect(res.config.webhookSecret).toBe('whsec_test');
  });

  it('fails when each required variable is individually absent', () => {
    for (const key of [
      'DATABASE_URL',
      'AUTH_JWKS_URL',
      'AUTH_ISSUER',
      'AUTH_AUDIENCE',
      'CLERK_WEBHOOK_SECRET',
    ]) {
      const env = prodEnv();
      delete env[key];
      const res = resolveStartupConfig(env);
      expect(res.ok, `missing ${key} must block startup`).toBe(false);
      if (res.ok) continue;
      expect(res.missing).toContain(key);
    }
  });

  it('requires MFA enforcement in production', () => {
    const env = prodEnv();
    env['AUTH_REQUIRE_MFA'] = 'false';
    const res = resolveStartupConfig(env);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.missing.some((m) => m.startsWith('AUTH_REQUIRE_MFA'))).toBe(true);
  });

  it('treats an unset APP_ENV as production (never the dev shim by default)', () => {
    // No APP_ENV/NODE_ENV, but the production vars are absent → fail closed.
    const res = resolveStartupConfig({});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.appEnv).toBe('production');
    expect(res.missing).toContain('DATABASE_URL');
  });

  it('never selects the dev shim in production', () => {
    const res = resolveStartupConfig(prodEnv());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.auth.kind).not.toBe('dev-shim');
  });
});

describe('resolveStartupConfig — development / test', () => {
  it('uses the dev header shim when JWKS or DATABASE_URL is absent', () => {
    const res = resolveStartupConfig({ APP_ENV: 'development' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.auth.kind).toBe('dev-shim');
    expect(res.config.databaseUrl).toBeUndefined();
  });

  it('uses JWT auth in development when both JWKS and DATABASE_URL are set', () => {
    const res = resolveStartupConfig({
      APP_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@h:5432/db',
      AUTH_JWKS_URL: 'https://app.clerk.accounts.dev/.well-known/jwks.json',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.auth).toMatchObject({ kind: 'jwt', requireMfa: false });
  });

  it('test env with no config resolves to the shim and in-memory stores', () => {
    const res = resolveStartupConfig({ APP_ENV: 'test' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.appEnv).toBe('test');
    expect(res.config.auth.kind).toBe('dev-shim');
  });
});
