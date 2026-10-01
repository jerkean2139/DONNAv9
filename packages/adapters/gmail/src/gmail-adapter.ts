import type {
  CapabilityAdapter,
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  ExecutionContext,
  HealthReport,
  UsageRecord,
} from '@donna/adapter-base';

import { GoogleApiError, type GoogleFetch } from './google-oauth.js';
import { buildRawMessage, MailValidationError, type MailMessage } from './mime.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** One Gmail operation. Sending is client-facing comms — callers gate it. */
export type GmailRequest =
  | { readonly op: 'draft.create'; readonly message: MailMessage }
  | { readonly op: 'message.send'; readonly message: MailMessage };

export interface GmailResult {
  readonly op: GmailRequest['op'];
  /** Gmail message id (for a draft, the draft's message). */
  readonly messageId: string;
  readonly threadId?: string;
  readonly draftId?: string;
}

export interface GmailAdapterOptions {
  /** Returns a valid access token for the connected account. */
  readonly accessToken: () => Promise<string>;
  readonly fetchImpl?: GoogleFetch;
  readonly baseUrl?: string;
}

/**
 * Gmail `CapabilityAdapter`: creates drafts in, or sends from, the connected
 * account. It holds no secrets itself — the access token is supplied per call
 * by the caller's credential store.
 *
 * Gmail has no idempotency key; callers must record the attempt durably before
 * calling `execute` and never retry a send whose outcome is unknown.
 */
export class GmailAdapter implements CapabilityAdapter<GmailRequest, GmailResult> {
  readonly id = 'gmail';
  readonly name = 'Gmail';
  readonly version = '1.0.0';
  private readonly fetchImpl: GoogleFetch;
  private readonly baseUrl: string;
  private lastUsage: UsageRecord | undefined;

  constructor(private readonly options: GmailAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.baseUrl = options.baseUrl ?? GMAIL_BASE;
  }

  capabilities(): CapabilitySpec {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      capabilities: ['email.draft', 'email.send'],
    };
  }

  async health(): Promise<HealthReport> {
    return { status: 'healthy' };
  }

  async estimate(): Promise<CostEstimate> {
    return { costUsd: 0, latencyMs: 800, confidence: 0.6 };
  }

  async execute(input: GmailRequest, ctx: ExecutionContext): Promise<GmailResult> {
    const raw = buildRawMessage(input.message);
    const started = Date.now();
    const token = await this.options.accessToken();
    const [path, body] =
      input.op === 'draft.create' ? ['/drafts', { message: { raw } }] : ['/messages/send', { raw }];
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
      });
    } catch {
      throw new GoogleApiError(0, 'network_error');
    }
    this.lastUsage = { costUsd: 0, latencyMs: Date.now() - started };
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const err = (await res.json()) as { error?: { status?: unknown } };
        if (typeof err.error?.status === 'string') code = err.error.status;
      } catch {
        // keep the http code
      }
      throw new GoogleApiError(res.status, code);
    }
    const data = (await res.json()) as {
      id?: string;
      threadId?: string;
      message?: { id?: string; threadId?: string };
    };
    if (input.op === 'draft.create') {
      return {
        op: input.op,
        messageId: data.message?.id ?? '',
        ...(data.message?.threadId !== undefined ? { threadId: data.message.threadId } : {}),
        ...(data.id !== undefined ? { draftId: data.id } : {}),
      };
    }
    return {
      op: input.op,
      messageId: data.id ?? '',
      ...(data.threadId !== undefined ? { threadId: data.threadId } : {}),
    };
  }

  reportUsage(): UsageRecord | undefined {
    return this.lastUsage;
  }

  classifyError(error: unknown): ErrorClass {
    if (error instanceof MailValidationError) return 'deterministic';
    if (error instanceof GoogleApiError) {
      if (error.status === 0) return 'transient';
      if (error.status === 401 || error.status === 403 || error.needsReconnect) return 'auth';
      if (error.status === 429) return 'rate_limit';
      if (error.status >= 500) return 'unavailable';
      return 'deterministic';
    }
    return 'unknown';
  }
}
