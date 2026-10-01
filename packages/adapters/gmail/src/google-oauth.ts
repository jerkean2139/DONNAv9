/**
 * Google OAuth 2.0 (web server flow) for Gmail. The client secret and refresh
 * tokens are secrets: they come from the environment / the caller's encrypted
 * store and are never logged or returned to a browser.
 */

export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * `gmail.compose` covers creating drafts and sending — and nothing else: Donna
 * cannot read the mailbox. `openid email` identifies which address connected.
 */
export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.compose',
] as const;

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly fetchImpl?: GoogleFetch;
}

/** A Google API call failed. `status` is the HTTP status (0 for network errors). */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Google API error ${status}: ${code}`);
    this.name = 'GoogleApiError';
  }

  /** The user revoked access or the grant expired — they must reconnect. */
  get needsReconnect(): boolean {
    return this.code === 'invalid_grant' || this.status === 401;
  }
}

export interface GoogleGrant {
  readonly refreshToken: string;
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly email: string;
  readonly scopes: readonly string[];
}

export interface AccessToken {
  readonly accessToken: string;
  readonly expiresAt: Date;
}

/** Decodes a JWT payload without verifying it. Only for an id_token received
 *  directly from Google's token endpoint over TLS (OIDC Core §3.1.3.7). */
function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (part === undefined) return {};
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
    if (typeof body.error === 'object' && body.error !== null) {
      const status = (body.error as { status?: unknown }).status;
      if (typeof status === 'string') return status;
    }
  } catch {
    // fall through
  }
  return `http_${res.status}`;
}

export class GoogleOAuth {
  private readonly fetchImpl: GoogleFetch;

  constructor(private readonly config: GoogleOAuthConfig) {
    this.fetchImpl = config.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  /** The consent URL. `state` must be unguessable and bound to the caller. */
  authorizationUrl(state: string, loginHint?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline',
      // Always show consent so Google returns a refresh token on reconnect.
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      ...(loginHint !== undefined ? { login_hint: loginHint } : {}),
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  private async token(params: Record<string, string>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          ...params,
        }).toString(),
      });
    } catch {
      throw new GoogleApiError(0, 'network_error');
    }
    if (!res.ok) throw new GoogleApiError(res.status, await errorCode(res));
    return (await res.json()) as Record<string, unknown>;
  }

  /** Exchanges an authorization code for a refresh token + identity. */
  async exchangeCode(code: string): Promise<GoogleGrant> {
    const body = await this.token({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });
    const refreshToken = body['refresh_token'];
    const accessToken = body['access_token'];
    if (typeof refreshToken !== 'string' || typeof accessToken !== 'string') {
      throw new GoogleApiError(200, 'no_refresh_token');
    }
    const scopes = typeof body['scope'] === 'string' ? body['scope'].split(' ') : [];
    if (!scopes.includes('https://www.googleapis.com/auth/gmail.compose')) {
      throw new GoogleApiError(200, 'scope_not_granted');
    }
    const claims = typeof body['id_token'] === 'string' ? jwtPayload(body['id_token']) : {};
    const email = typeof claims['email'] === 'string' ? claims['email'] : '';
    if (email === '') throw new GoogleApiError(200, 'no_email');
    return {
      refreshToken,
      accessToken,
      expiresAt: new Date(Date.now() + Number(body['expires_in'] ?? 3600) * 1000),
      email,
      scopes,
    };
  }

  /** A fresh access token from a stored refresh token. */
  async refresh(refreshToken: string): Promise<AccessToken> {
    const body = await this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' });
    const accessToken = body['access_token'];
    if (typeof accessToken !== 'string') throw new GoogleApiError(200, 'no_access_token');
    return {
      accessToken,
      expiresAt: new Date(Date.now() + Number(body['expires_in'] ?? 3600) * 1000),
    };
  }

  /** Best-effort revocation when the user disconnects. */
  async revoke(token: string): Promise<void> {
    try {
      await this.fetchImpl(REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      // The local grant is deleted regardless.
    }
  }
}
