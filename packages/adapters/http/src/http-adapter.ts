import type {
  CapabilityAdapter,
  CapabilitySpec,
  CostEstimate,
  ErrorClass,
  ExecutionContext,
  HealthReport,
  UsageRecord,
} from '@donna/adapter-base';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One HTTP call, relative to the adapter's fixed base URL. */
export interface HttpRequest {
  /** Path (and optional query) under the base URL — never an absolute URL. */
  readonly path: string;
  readonly method?: HttpMethod;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** JSON-serialized when an object; sent as-is when a string. */
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/** Minimal fetch surface, so the adapter needs no DOM lib and is easily faked. */
export interface HttpFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: {
    get(name: string): string | null;
    forEach(cb: (value: string, key: string) => void): void;
  };
  text(): Promise<string>;
}
export type HttpFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<HttpFetchResponse>;

/** A non-2xx response — carries the parsed response for classification. */
export class HttpRequestError extends Error {
  constructor(readonly response: HttpResponse) {
    super(`HTTP ${response.status}`);
    this.name = 'HttpRequestError';
  }
}

/** A request that would escape the adapter's base origin (SSRF guard). */
export class HttpInvalidTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpInvalidTargetError';
  }
}

export interface HttpCapabilityOptions {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly provides: readonly string[];
  /** Fixed origin this adapter talks to — requests cannot escape it. */
  readonly baseUrl: string;
  /** Default headers (e.g. auth) — set from the environment, never a work order. */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /** Injected fetch (defaults to the platform `fetch`). */
  readonly fetchImpl?: HttpFetch;
  readonly defaultTimeoutMs?: number;
  readonly estimateUsd?: number;
}

const defaultFetch: HttpFetch = (url, init) =>
  (globalThis.fetch as unknown as HttpFetch)(url, init);

/**
 * A real HTTP {@link CapabilityAdapter} (the `automation` execution class) — the
 * outbound counterpart to the deterministic function adapter. It is **bound to a
 * fixed base URL**, so a work order supplies only the path/method/body and can
 * never redirect the call to another host (no SSRF); auth lives in
 * `defaultHeaders` from the environment, never in the order (Technical Plan
 * §7.4/§8). Concrete integrations (GHL, Apollo, …) are this adapter configured
 * with a base URL and auth, or a thin subclass.
 *
 * It honors `ctx.idempotencyKey` (sent as `Idempotency-Key`) so a retried call
 * does not duplicate a side effect, and maps transport/HTTP failures into the
 * shared {@link ErrorClass} taxonomy so the orchestrator's retry/fallback logic
 * lives in one place.
 */
export class HttpCapabilityAdapter implements CapabilityAdapter<HttpRequest, HttpResponse> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  private readonly provides: readonly string[];
  private readonly baseUrl: string;
  private readonly baseOrigin: string;
  private readonly defaultHeaders: Readonly<Record<string, string>>;
  private readonly fetchImpl: HttpFetch;
  private readonly defaultTimeoutMs: number;
  private readonly estimateUsd: number;
  private lastUsage: UsageRecord | undefined;

  constructor(options: HttpCapabilityOptions) {
    this.id = options.id;
    this.name = options.name ?? options.id;
    this.version = options.version ?? '1';
    this.provides = options.provides;
    this.baseUrl = options.baseUrl;
    this.baseOrigin = new URL(options.baseUrl).origin;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.estimateUsd = options.estimateUsd ?? 0;
  }

  capabilities(): CapabilitySpec {
    return { id: this.id, name: this.name, version: this.version, capabilities: this.provides };
  }

  health(): Promise<HealthReport> {
    // Optimistic; a cheap liveness probe can be added without changing routing.
    return Promise.resolve({ status: 'healthy' });
  }

  estimate(): Promise<CostEstimate> {
    return Promise.resolve({ costUsd: this.estimateUsd, latencyMs: 0, confidence: 0.5 });
  }

  async execute(input: HttpRequest, ctx: ExecutionContext): Promise<HttpResponse> {
    const url = this.resolveUrl(input);
    const method = input.method ?? 'GET';
    const headers: Record<string, string> = { ...this.defaultHeaders, ...input.headers };

    let body: string | undefined;
    if (input.body !== undefined && method !== 'GET') {
      if (typeof input.body === 'string') {
        body = input.body;
      } else {
        body = JSON.stringify(input.body);
        headers['content-type'] ??= 'application/json';
      }
    }
    if (ctx.idempotencyKey !== undefined) headers['idempotency-key'] = ctx.idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
    if (ctx.signal !== undefined) {
      ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const startedAt = Date.now();
    let raw: HttpFetchResponse;
    try {
      raw = await this.fetchImpl(url, {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body } : {}),
      });
    } finally {
      clearTimeout(timer);
    }

    const response = await toResponse(raw);
    this.lastUsage = {
      costUsd: this.estimateUsd,
      latencyMs: Date.now() - startedAt,
      details: { status: response.status },
    };
    if (!response.ok) throw new HttpRequestError(response);
    return response;
  }

  reportUsage(): UsageRecord | undefined {
    return this.lastUsage;
  }

  classifyError(error: unknown): ErrorClass {
    if (error instanceof HttpInvalidTargetError) return 'deterministic';
    if (error instanceof HttpRequestError) {
      const s = error.response.status;
      if (s === 429) return 'rate_limit';
      if (s === 401 || s === 403) return 'auth';
      if (s >= 500) return 'unavailable';
      if (s === 408) return 'transient';
      return 'deterministic'; // other 4xx — a client error, not worth retrying
    }
    // Transport failures (network reset, DNS, timeout/abort) are transient.
    return 'transient';
  }

  private resolveUrl(input: HttpRequest): string {
    const target = new URL(input.path, this.baseUrl);
    if (target.origin !== this.baseOrigin) {
      throw new HttpInvalidTargetError(
        `request path "${input.path}" escapes the adapter's base origin`,
      );
    }
    if (input.query !== undefined) {
      for (const [key, value] of Object.entries(input.query)) {
        target.searchParams.set(key, String(value));
      }
    }
    return target.toString();
  }
}

async function toResponse(raw: HttpFetchResponse): Promise<HttpResponse> {
  const text = await raw.text();
  const contentType = raw.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json') || contentType.includes('+json');
  let parsed: unknown = text;
  if (isJson && text !== '') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const headers: Record<string, string> = {};
  raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: raw.status, ok: raw.ok, headers, body: parsed };
}
