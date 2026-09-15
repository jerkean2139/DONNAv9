import type {
  CapabilityAdapter,
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  ExecutionContext,
  HealthReport,
  UsageRecord,
} from '@donna/adapter-base';
import { HttpCapabilityAdapter, type HttpFetch, type HttpRequest } from '@donna/adapter-http';

/** GoHighLevel v2 (LeadConnector) API base. */
const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
/** GHL requires an API version header on v2 requests. */
const GHL_API_VERSION = '2021-07-28';

/** A required config value (e.g. locationId) is missing — a caller error. */
export class GhlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhlConfigError';
  }
}

export interface GhlContactInput {
  readonly email?: string;
  readonly phone?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly source?: string;
  /** Overrides the adapter's default location for this call. */
  readonly locationId?: string;
  readonly customFields?: readonly { readonly id: string; readonly value: string }[];
}

/** A GHL operation. The orchestrator passes one of these as `capabilityInput`. */
export type GhlRequest =
  | { readonly op: 'contact.upsert'; readonly contact: GhlContactInput }
  | { readonly op: 'contact.get'; readonly contactId: string }
  | {
      readonly op: 'contact.search';
      readonly query?: string;
      readonly limit?: number;
      readonly locationId?: string;
    }
  | {
      readonly op: 'message.send';
      readonly contactId: string;
      readonly type: 'SMS' | 'Email';
      readonly message?: string;
      readonly subject?: string;
      readonly html?: string;
    };

export interface GhlResult {
  readonly op: GhlRequest['op'];
  readonly status: number;
  readonly data: unknown;
}

export interface GhlAdapterOptions {
  /** Private Integration / OAuth access token — from the environment, never source (§8). */
  readonly token: string;
  /** Default GHL location (sub-account) id; a request may override it. */
  readonly locationId?: string;
  readonly id?: string;
  readonly provides?: readonly string[];
  readonly baseUrl?: string;
  readonly apiVersion?: string;
  readonly fetchImpl?: HttpFetch;
  readonly timeoutMs?: number;
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Map a {@link GhlRequest} to the underlying {@link HttpRequest} against the GHL
 * v2 API. Pure and unit-testable — this is the "shape" of the integration, so a
 * test asserts the exact path/method/body without a live account. `throws`
 * {@link GhlConfigError} when a `locationId` is required but absent.
 */
export function toHttpRequest(req: GhlRequest, defaultLocationId?: string): HttpRequest {
  switch (req.op) {
    case 'contact.upsert': {
      const locationId = req.contact.locationId ?? defaultLocationId;
      if (locationId === undefined) {
        throw new GhlConfigError('contact.upsert requires a locationId');
      }
      const { locationId: _ignore, ...fields } = req.contact;
      void _ignore;
      return { path: '/contacts/upsert', method: 'POST', body: { locationId, ...compact(fields) } };
    }
    case 'contact.get':
      return { path: `/contacts/${encodeURIComponent(req.contactId)}`, method: 'GET' };
    case 'contact.search': {
      const locationId = req.locationId ?? defaultLocationId;
      if (locationId === undefined) {
        throw new GhlConfigError('contact.search requires a locationId');
      }
      return {
        path: '/contacts/search',
        method: 'POST',
        body: compact({ locationId, query: req.query, pageLimit: req.limit }),
      };
    }
    case 'message.send':
      return {
        path: '/conversations/messages',
        method: 'POST',
        body: compact({
          type: req.type,
          contactId: req.contactId,
          message: req.message,
          subject: req.subject,
          html: req.html,
        }),
      };
  }
}

/**
 * GoHighLevel CRM {@link CapabilityAdapter} — a concrete integration built on the
 * generic HTTP capability adapter (Technical Plan §7). It shapes DONNA's CRM
 * operations into GHL v2 API calls, and inherits the HTTP adapter's guarantees:
 * bound to the GHL origin (no SSRF), idempotency via `ctx.idempotencyKey`, the
 * shared error taxonomy, and a request timeout. The API token is a secret from
 * the environment / secrets manager — never a work order (§8).
 */
export class GhlCapabilityAdapter implements CapabilityAdapter<GhlRequest, GhlResult> {
  readonly id: string;
  readonly name: string;
  readonly version = '1';

  private readonly provides: readonly string[];
  private readonly locationId: string | undefined;
  private readonly http: HttpCapabilityAdapter;

  constructor(options: GhlAdapterOptions) {
    this.id = options.id ?? 'ghl.crm';
    this.name = 'GoHighLevel CRM';
    this.provides = options.provides ?? ['crm', 'ghl'];
    this.locationId = options.locationId;
    this.http = new HttpCapabilityAdapter({
      id: this.id,
      provides: this.provides,
      baseUrl: options.baseUrl ?? GHL_BASE_URL,
      defaultHeaders: {
        authorization: `Bearer ${options.token}`,
        version: options.apiVersion ?? GHL_API_VERSION,
        accept: 'application/json',
      },
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.timeoutMs !== undefined ? { defaultTimeoutMs: options.timeoutMs } : {}),
    });
  }

  capabilities(): CapabilitySpec {
    return { id: this.id, name: this.name, version: this.version, capabilities: this.provides };
  }

  health(): Promise<HealthReport> {
    return this.http.health();
  }

  estimate(): Promise<CostEstimate> {
    return this.http.estimate();
  }

  async execute(input: GhlRequest, ctx: ExecutionContext): Promise<GhlResult> {
    const response = await this.http.execute(toHttpRequest(input, this.locationId), ctx);
    return { op: input.op, status: response.status, data: response.body };
  }

  reportUsage(): UsageRecord | undefined {
    return this.http.reportUsage();
  }

  classifyError(error: unknown): ErrorClass {
    if (error instanceof GhlConfigError) return 'deterministic';
    return this.http.classifyError(error);
  }
}
