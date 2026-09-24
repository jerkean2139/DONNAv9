import type { ObjectiveView } from '../types';

// Typed client for the control-plane API. Same-origin by default (the
// control-plane serves this app). Requests are signed by `authHeaders`: a Clerk
// bearer token in production, or the dev-shim `x-donna-*` identity outside it.

export interface ClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Static headers added to every authenticated request (dev shim). */
  principalHeaders?: Record<string, string>;
  /** Per-request auth headers, e.g. a fresh bearer token. */
  authHeaders?: () => Promise<Record<string, string>>;
}

export interface CreateObjectiveRequest {
  requestedOutcome: string;
  definitionOfDone: string;
  scope?: 'PRIVATE' | 'PROJECT' | 'TEAM' | 'ORGANIZATION';
}

export type CreateObjectiveResult =
  { status: 'created'; objective: ObjectiveView } | { status: 'approval_required'; reason: string };

/** What `GET /client-config` returns: how this deployment authenticates. */
export type AuthConfig =
  | { auth: 'clerk'; clerkPublishableKey: string; clerkJwtTemplate?: string }
  | { auth: 'dev'; devPrincipal: { userId: string; organizationId: string; role: string } }
  | { auth: 'unconfigured' };

/** A non-2xx API response. `code` is the API's `error` field when present. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** The dev-shim identity headers the control-plane accepts outside production. */
export function devPrincipalHeaders(principal: {
  userId: string;
  organizationId: string;
  role: string;
}): Record<string, string> {
  return {
    'x-donna-user-id': principal.userId,
    'x-donna-org-id': principal.organizationId,
    'x-donna-role': principal.role,
    'x-donna-actor-kind': 'human',
  };
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Non-JSON error body; fall through to the status.
  }
  return `http_${res.status}`;
}

export class ControlPlaneClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly principalHeaders: Record<string, string>;
  private readonly authHeaders: () => Promise<Record<string, string>>;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.principalHeaders = config.principalHeaders ?? {};
    this.authHeaders = config.authHeaders ?? (() => Promise.resolve({}));
  }

  private async signed(): Promise<Record<string, string>> {
    return { ...this.principalHeaders, ...(await this.authHeaders()) };
  }

  async health(): Promise<{ status: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return (await res.json()) as { status: string };
  }

  async clientConfig(): Promise<AuthConfig> {
    const res = await this.fetchImpl(`${this.baseUrl}/client-config`);
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    return (await res.json()) as AuthConfig;
  }

  async listObjectives(): Promise<ObjectiveView[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/objectives`, {
      headers: await this.signed(),
    });
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    const body = (await res.json()) as { objectives: ObjectiveView[] };
    return body.objectives;
  }

  async createObjective(body: CreateObjectiveRequest): Promise<CreateObjectiveResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/objectives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.signed()) },
      body: JSON.stringify(body),
    });
    if (res.status === 403) throw new ApiError(403, 'forbidden');
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    if (res.status === 202) {
      const pending = (await res.json()) as { reason?: string };
      return { status: 'approval_required', reason: pending.reason ?? 'approval_required' };
    }
    return { status: 'created', objective: (await res.json()) as ObjectiveView };
  }
}
