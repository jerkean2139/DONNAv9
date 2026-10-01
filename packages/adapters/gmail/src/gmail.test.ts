import { describe, expect, it, vi } from 'vitest';

import { GmailAdapter } from './gmail-adapter.js';
import { GoogleApiError, GoogleOAuth } from './google-oauth.js';
import { buildRawMessage, MailValidationError, parseAddressList } from './mime.js';

function decode(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

function bodyOf(rfc822: string): string {
  const b64 = rfc822.split('\r\n\r\n')[1] ?? '';
  return Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('buildRawMessage', () => {
  it('builds a plain-text message with encoded subject and body', () => {
    const raw = decode(
      buildRawMessage({
        to: ['ana@acme.co'],
        cc: ['bo@acme.co'],
        subject: 'Launch — next steps',
        body: 'Hi Ana,\nSee you Monday.',
      }),
    );
    expect(raw).toContain('To: ana@acme.co\r\n');
    expect(raw).toContain('Cc: bo@acme.co\r\n');
    expect(raw).toContain(
      `Subject: =?UTF-8?B?${Buffer.from('Launch — next steps').toString('base64')}?=`,
    );
    expect(bodyOf(raw)).toBe('Hi Ana,\r\nSee you Monday.');
  });

  it('rejects header injection and bad addresses', () => {
    const base = { to: ['a@b.co'], subject: 'Hi', body: 'x' };
    expect(() => buildRawMessage({ ...base, subject: 'Hi\r\nBcc: evil@x.co' })).toThrow(
      MailValidationError,
    );
    expect(() => buildRawMessage({ ...base, to: ['a@b.co\r\nBcc: e@x.co'] })).toThrow(
      MailValidationError,
    );
    expect(() => buildRawMessage({ ...base, to: ['not-an-address'] })).toThrow(MailValidationError);
    expect(() => buildRawMessage({ ...base, to: [] })).toThrow(MailValidationError);
    expect(() => buildRawMessage({ ...base, body: '  ' })).toThrow(MailValidationError);
  });

  it('parses address lists', () => {
    expect(parseAddressList(' a@b.co, c@d.co;e@f.co ')).toEqual(['a@b.co', 'c@d.co', 'e@f.co']);
  });
});

describe('GoogleOAuth', () => {
  const config = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app/cb' };

  it('builds an offline consent URL limited to gmail.compose', () => {
    const url = new URL(new GoogleOAuth(config).authorizationUrl('st8'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('st8');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(url.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/gmail.compose',
    );
  });

  it('exchanges a code for a refresh token and the account email', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'me@acme.co' })).toString('base64url')}.y`;
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      json(200, {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'openid https://www.googleapis.com/auth/gmail.compose email',
        id_token: idToken,
      }),
    );
    const grant = await new GoogleOAuth({ ...config, fetchImpl }).exchangeCode('code1');
    expect(grant).toMatchObject({ refreshToken: 'rt', accessToken: 'at', email: 'me@acme.co' });
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]![1].body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code1');
  });

  it('refuses a grant without the compose scope', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { access_token: 'at', refresh_token: 'rt', scope: 'openid email' }),
    );
    await expect(new GoogleOAuth({ ...config, fetchImpl }).exchangeCode('c')).rejects.toMatchObject(
      {
        code: 'scope_not_granted',
      },
    );
  });

  it('surfaces a revoked grant as needing reconnect', async () => {
    const fetchImpl = vi.fn(async () => json(400, { error: 'invalid_grant' }));
    const err = await new GoogleOAuth({ ...config, fetchImpl }).refresh('rt').catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect((err as GoogleApiError).needsReconnect).toBe(true);
  });
});

describe('GmailAdapter', () => {
  const message = { to: ['ana@acme.co'], subject: 'Hi', body: 'Hello' };

  it('sends through messages/send with the bearer token', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      json(200, { id: 'm1', threadId: 't1' }),
    );
    const adapter = new GmailAdapter({ accessToken: async () => 'tok', fetchImpl });
    const result = await adapter.execute({ op: 'message.send', message }, {});
    expect(result).toEqual({ op: 'message.send', messageId: 'm1', threadId: 't1' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
    expect(decode(JSON.parse(String(init.body)).raw)).toContain('To: ana@acme.co');
  });

  it('creates drafts through drafts', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      json(200, { id: 'd1', message: { id: 'm2', threadId: 't2' } }),
    );
    const adapter = new GmailAdapter({ accessToken: async () => 'tok', fetchImpl });
    const result = await adapter.execute({ op: 'draft.create', message }, {});
    expect(result).toEqual({ op: 'draft.create', messageId: 'm2', threadId: 't2', draftId: 'd1' });
    expect(fetchImpl.mock.calls[0]![0]).toMatch(/\/drafts$/);
  });

  it('classifies Gmail errors', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { status: 'PERMISSION_DENIED' } }));
    const adapter = new GmailAdapter({ accessToken: async () => 'tok', fetchImpl });
    const err = await adapter.execute({ op: 'message.send', message }, {}).catch((e) => e);
    expect(err).toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });
    expect(adapter.classifyError(err)).toBe('auth');
    expect(adapter.classifyError(new GoogleApiError(503, 'x'))).toBe('unavailable');
  });
});
