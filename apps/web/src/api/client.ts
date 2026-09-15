import type { ObjectiveView } from '../types';

// Typed client for the control-plane API. The base URL comes from the
// environment (VITE_API_URL); dev auth passes identity via x-donna-* headers —
// TEMPORARY, replaced by real session auth (Technical Plan §2/§8).

export interface ClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Dev-only principal headers until real auth lands. */
  principalHeaders?: Record<string, string>;
}

export interface CreateObjectiveRequest {
  requestedOutcome: string;
  definitionOfDone: string;
  scope?: 'PRIVATE' | 'PROJECT' | 'TEAM' | 'ORGANIZATION';
}

export class ControlPlaneClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly principalHeaders: Record<string, string>;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.principalHeaders = config.principalHeaders ?? {};
  }

  async health(): Promise<{ status: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return (await res.json()) as { status: string };
  }

  async createObjective(body: CreateObjectiveRequest): Promise<ObjectiveView> {
    const res = await this.fetchImpl(`${this.baseUrl}/objectives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.principalHeaders },
      body: JSON.stringify(body),
    });
    if (res.status === 403) throw new Error('forbidden');
    if (!res.ok) throw new Error(`createObjective failed: ${res.status}`);
    return (await res.json()) as ObjectiveView;
  }
}
