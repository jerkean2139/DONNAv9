/**
 * Startup configuration resolution (Technical Plan §6/§8, SEC-1).
 *
 * The control-plane must FAIL CLOSED in production: the development header shim
 * (which trusts caller-supplied identity) and the non-durable in-memory stores
 * must never back a production process, and production must refuse to start
 * unless the full auth + persistence configuration is present. This module is
 * pure and side-effect free so the policy is unit-testable; `main.ts` applies it
 * (printing the missing variables' NAMES — never their values — and exiting
 * before the HTTP listener opens).
 */

export type AppEnv = 'production' | 'development' | 'test';

/**
 * Resolve the runtime environment. `APP_ENV` wins, then `NODE_ENV`; anything
 * unrecognized or unset resolves to `production` so an un-configured process
 * fails closed rather than silently trusting header identity.
 */
export function resolveAppEnv(env: Record<string, string | undefined>): AppEnv {
  const raw = (env['APP_ENV'] ?? env['NODE_ENV'] ?? '').trim().toLowerCase();
  if (raw === 'development' || raw === 'dev') return 'development';
  if (raw === 'test') return 'test';
  return 'production';
}

/** JWT verification inputs (Clerk/OIDC). Present whenever auth is `jwt`. */
export interface JwtAuthConfig {
  readonly kind: 'jwt';
  readonly jwksUrl: string;
  readonly issuer: string | undefined;
  readonly audience: string | undefined;
  readonly requireMfa: boolean;
  readonly mfaClaim: string | undefined;
}

/** The development header shim — only ever selected outside production. */
export interface DevShimAuthConfig {
  readonly kind: 'dev-shim';
}

export interface StartupConfig {
  readonly appEnv: AppEnv;
  /** Postgres connection string. Guaranteed present (durable) in production. */
  readonly databaseUrl: string | undefined;
  readonly auth: JwtAuthConfig | DevShimAuthConfig;
  /** Clerk webhook signing secret. Guaranteed present in production. */
  readonly webhookSecret: string | undefined;
}

export type StartupResolution =
  | { readonly ok: true; readonly config: StartupConfig }
  | { readonly ok: false; readonly appEnv: AppEnv; readonly missing: readonly string[] };

function present(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * The variables production requires. Each maps a human-facing name to whether
 * the current environment satisfies it, so a failure can name exactly what is
 * absent without ever echoing a secret's value.
 */
function missingProductionVars(env: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  if (!present(env['DATABASE_URL'])) missing.push('DATABASE_URL');
  if (!present(env['AUTH_JWKS_URL'])) missing.push('AUTH_JWKS_URL');
  if (!present(env['AUTH_ISSUER'])) missing.push('AUTH_ISSUER');
  if (!present(env['AUTH_AUDIENCE'])) missing.push('AUTH_AUDIENCE');
  if (!present(env['CLERK_WEBHOOK_SECRET'])) missing.push('CLERK_WEBHOOK_SECRET');
  // MFA must be explicitly enforced in production.
  if (env['AUTH_REQUIRE_MFA'] !== 'true') missing.push('AUTH_REQUIRE_MFA (must be "true")');
  return missing;
}

/**
 * Decide how the process should start. In production, missing required
 * configuration returns `{ ok: false, missing }` — the caller exits before
 * listening. In development/test, the durable path is used when its inputs are
 * present and the header shim is the explicit fallback.
 */
export function resolveStartupConfig(env: Record<string, string | undefined>): StartupResolution {
  const appEnv = resolveAppEnv(env);

  if (appEnv === 'production') {
    const missing = missingProductionVars(env);
    if (missing.length > 0) return { ok: false, appEnv, missing };
    return {
      ok: true,
      config: {
        appEnv,
        databaseUrl: env['DATABASE_URL'],
        auth: {
          kind: 'jwt',
          jwksUrl: env['AUTH_JWKS_URL'] as string,
          issuer: env['AUTH_ISSUER'],
          audience: env['AUTH_AUDIENCE'],
          requireMfa: true,
          mfaClaim: env['AUTH_MFA_CLAIM'],
        },
        webhookSecret: env['CLERK_WEBHOOK_SECRET'],
      },
    };
  }

  // development / test: durable + JWT when configured, else the header shim.
  const databaseUrl = present(env['DATABASE_URL']) ? env['DATABASE_URL'] : undefined;
  const jwksUrl = env['AUTH_JWKS_URL'];
  const useJwt = present(jwksUrl) && databaseUrl !== undefined;
  return {
    ok: true,
    config: {
      appEnv,
      databaseUrl,
      auth: useJwt
        ? {
            kind: 'jwt',
            jwksUrl: jwksUrl as string,
            issuer: env['AUTH_ISSUER'],
            audience: env['AUTH_AUDIENCE'],
            requireMfa: env['AUTH_REQUIRE_MFA'] === 'true',
            mfaClaim: env['AUTH_MFA_CLAIM'],
          }
        : { kind: 'dev-shim' },
      webhookSecret: present(env['CLERK_WEBHOOK_SECRET']) ? env['CLERK_WEBHOOK_SECRET'] : undefined,
    },
  };
}
