import {
  GmailAdapter,
  GoogleApiError,
  MailValidationError,
  validateMessage,
  type GoogleFetch,
  type GoogleOAuth,
  type MailMessage,
} from '@donna/adapter-gmail';
import type { EmailMode } from '@donna/core-domain';

import type { SecretBox } from './secret-box.js';
import type { ConnectionStore, EmailStore, OutboundEmailView } from './stores.js';

/** Errors with stable codes the routes map to HTTP statuses. */
export class GmailError extends Error {
  constructor(
    readonly code:
      | 'gmail_unconfigured'
      | 'gmail_not_connected'
      | 'gmail_reconnect'
      | 'send_in_progress'
      | 'gmail_failed'
      | MailValidationError['code'],
  ) {
    super(code);
    this.name = 'GmailError';
  }
}

export interface GmailStatus {
  /** The deployment has Google OAuth credentials and an encryption key. */
  readonly configured: boolean;
  readonly connected: boolean;
  readonly email: string | null;
}

/** How long a connect link stays valid. */
const STATE_TTL_MS = 10 * 60 * 1000;
/** A send still `pending` this long is treated as abandoned, not in progress. */
const PENDING_WINDOW_MS = 2 * 60 * 1000;

export interface GmailServiceDeps {
  readonly connections: ConnectionStore;
  readonly emails: EmailStore;
  /** Both absent → Gmail is not configured on this deployment. */
  readonly oauth?: GoogleOAuth;
  readonly box?: SecretBox;
  /** Overrides the Gmail API transport (tests). */
  readonly fetchImpl?: GoogleFetch;
}

/**
 * Gmail for a person's tasks: connect their Google account, then save Donna's
 * drafts into their Gmail drafts or — with their explicit confirmation —
 * send them. Mail always goes out from the person's own account. Policy
 * (who may draft/send) is decided by the routes before calling in here.
 */
export class GmailService {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly deps: GmailServiceDeps) {}

  get configured(): boolean {
    return this.deps.oauth !== undefined && this.deps.box !== undefined;
  }

  private require(): { oauth: GoogleOAuth; box: SecretBox } {
    const { oauth, box } = this.deps;
    if (oauth === undefined || box === undefined) throw new GmailError('gmail_unconfigured');
    return { oauth, box };
  }

  async status(org: string, userId: string): Promise<GmailStatus> {
    if (!this.configured) return { configured: false, connected: false, email: null };
    const connection = await this.deps.connections.get(org, userId);
    return { configured: true, connected: connection !== null, email: connection?.email ?? null };
  }

  /** The Google consent URL for this user; the state binds the result to them. */
  connectUrl(org: string, userId: string): string {
    const { oauth, box } = this.require();
    return oauth.authorizationUrl(box.sign({ o: org, u: userId }, STATE_TTL_MS));
  }

  /**
   * Finishes the OAuth round trip. Returns the connected address, or an error
   * code for the browser redirect. Never throws on bad input from the callback.
   */
  async complete(
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
    if (!this.configured) return { ok: false, reason: 'unconfigured' };
    const { oauth, box } = this.require();
    const payload = state === undefined ? null : box.verify(state);
    const org = payload?.['o'];
    const userId = payload?.['u'];
    if (typeof org !== 'string' || typeof userId !== 'string') {
      return { ok: false, reason: 'expired' };
    }
    if (code === undefined || code === '') return { ok: false, reason: 'denied' };
    try {
      const grant = await oauth.exchangeCode(code);
      await this.deps.connections.save({
        organizationId: org,
        userId,
        email: grant.email,
        refreshTokenEnc: box.encrypt(grant.refreshToken),
        scopes: grant.scopes,
      });
      this.tokens.set(`${org}:${userId}`, {
        token: grant.accessToken,
        expiresAt: grant.expiresAt.getTime(),
      });
      return { ok: true, email: grant.email };
    } catch (error) {
      if (error instanceof GoogleApiError && error.code === 'scope_not_granted') {
        return { ok: false, reason: 'scope' };
      }
      return { ok: false, reason: 'failed' };
    }
  }

  async disconnect(org: string, userId: string): Promise<void> {
    this.tokens.delete(`${org}:${userId}`);
    const removed = await this.deps.connections.remove(org, userId);
    if (removed === null || !this.configured) return;
    const { oauth, box } = this.require();
    try {
      await oauth.revoke(box.decrypt(removed.refreshTokenEnc));
    } catch {
      // Already deleted locally; revocation is best-effort.
    }
  }

  list(org: string, workItemId: string): Promise<OutboundEmailView[]> {
    return this.deps.emails.listForTask(org, workItemId);
  }

  private async accessToken(org: string, userId: string, refreshTokenEnc: string) {
    const key = `${org}:${userId}`;
    const cached = this.tokens.get(key);
    if (cached !== undefined && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const { oauth, box } = this.require();
    try {
      const fresh = await oauth.refresh(box.decrypt(refreshTokenEnc));
      this.tokens.set(key, { token: fresh.accessToken, expiresAt: fresh.expiresAt.getTime() });
      return fresh.accessToken;
    } catch (error) {
      if (error instanceof GoogleApiError && !error.needsReconnect) {
        throw new GmailError('gmail_failed');
      }
      // Revoked, expired, or sealed with a rotated key: they must reconnect.
      throw new GmailError('gmail_reconnect');
    }
  }

  /**
   * Saves the message to the user's Gmail drafts (`draft`) or sends it
   * (`send`). The attempt is recorded before Gmail is called; a failed or
   * interrupted send is never retried automatically.
   */
  async deliver(
    org: string,
    userId: string,
    workItemId: string,
    message: MailMessage,
    mode: EmailMode,
  ): Promise<OutboundEmailView> {
    this.require();
    const connection = await this.deps.connections.get(org, userId);
    if (connection === null) throw new GmailError('gmail_not_connected');
    let clean: MailMessage;
    try {
      clean = validateMessage(message);
    } catch (error) {
      if (error instanceof MailValidationError) throw new GmailError(error.code);
      throw error;
    }
    if (
      mode === 'send' &&
      (await this.deps.emails.hasPending(org, workItemId, new Date(Date.now() - PENDING_WINDOW_MS)))
    ) {
      throw new GmailError('send_in_progress');
    }
    const token = await this.accessToken(org, userId, connection.refreshTokenEnc);
    const record = await this.deps.emails.begin({
      organizationId: org,
      workItemId,
      userId,
      fromEmail: connection.email,
      to: clean.to,
      cc: clean.cc ?? [],
      subject: clean.subject,
      body: clean.body,
      mode,
    });
    const adapter = new GmailAdapter({
      accessToken: async () => token,
      ...(this.deps.fetchImpl !== undefined ? { fetchImpl: this.deps.fetchImpl } : {}),
    });
    try {
      const result = await adapter.execute(
        { op: mode === 'send' ? 'message.send' : 'draft.create', message: clean },
        { idempotencyKey: record.id, correlationId: `email.${mode}` },
      );
      const done = await this.deps.emails.finish(org, record.id, {
        status: 'done',
        messageId: result.messageId,
        ...(result.draftId !== undefined ? { draftId: result.draftId } : {}),
      });
      return done ?? record;
    } catch (error) {
      const reconnect = error instanceof GoogleApiError && error.needsReconnect;
      const code = error instanceof GoogleApiError ? error.code : 'unknown';
      await this.deps.emails.finish(org, record.id, { status: 'failed', error: code });
      if (reconnect) {
        this.tokens.delete(`${org}:${userId}`);
        throw new GmailError('gmail_reconnect');
      }
      throw new GmailError('gmail_failed');
    }
  }
}
