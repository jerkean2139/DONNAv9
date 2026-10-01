import type {
  AttachmentTarget,
  AttachmentView,
  ClientView,
  GmailStatus,
  ObjectiveView,
  OutboundEmailView,
  PlanRecordView,
  ProjectView,
  SprintView,
  WorkItemStatus,
  WorkItemView,
} from '../types';

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
export type AuthConfig = (
  | { auth: 'clerk'; clerkPublishableKey: string; clerkJwtTemplate?: string }
  | { auth: 'dev'; devPrincipal: { userId: string; organizationId: string; role: string } }
  | { auth: 'unconfigured' }
) & {
  /** Whether Donna can plan and draft (a model is configured server-side). */
  planner?: boolean;
  /** Whether Gmail can be connected (Google OAuth configured server-side). */
  gmail?: boolean;
};

export interface EmailRequest {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  mode: 'draft' | 'send';
  /** Required to send: the person's approval of this exact message. */
  confirm?: boolean;
}

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

  // ── Client work hierarchy ────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(await this.signed()),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async listClients(): Promise<ClientView[]> {
    return (await this.request<{ clients: ClientView[] }>('GET', '/clients')).clients;
  }

  createClient(name: string): Promise<ClientView> {
    return this.request('POST', '/clients', { name });
  }

  getClient(
    id: string,
  ): Promise<{ client: ClientView; projects: ProjectView[]; attachments: AttachmentView[] }> {
    return this.request('GET', `/clients/${encodeURIComponent(id)}`);
  }

  async listProjects(): Promise<ProjectView[]> {
    return (await this.request<{ projects: ProjectView[] }>('GET', '/projects')).projects;
  }

  createProject(name: string, clientId: string | null): Promise<ProjectView> {
    return this.request('POST', '/projects', { name, clientId });
  }

  getProject(id: string): Promise<{
    project: ProjectView;
    client: ClientView | null;
    sprints: SprintView[];
    tasks: WorkItemView[];
    attachments: AttachmentView[];
  }> {
    return this.request('GET', `/projects/${encodeURIComponent(id)}`);
  }

  createSprint(
    projectId: string,
    input: { name: string; startsOn?: string; endsOn?: string },
  ): Promise<SprintView> {
    return this.request('POST', `/projects/${encodeURIComponent(projectId)}/sprints`, input);
  }

  createTask(
    projectId: string,
    input: { title: string; sprintId?: string | null; parentId?: string | null },
  ): Promise<WorkItemView> {
    return this.request('POST', `/projects/${encodeURIComponent(projectId)}/tasks`, input);
  }

  getTask(id: string): Promise<{
    task: WorkItemView;
    project: ProjectView;
    subtasks: WorkItemView[];
    attachments: AttachmentView[];
  }> {
    return this.request('GET', `/tasks/${encodeURIComponent(id)}`);
  }

  updateTask(
    id: string,
    patch: { title?: string; status?: WorkItemStatus; sprintId?: string | null },
  ): Promise<WorkItemView> {
    return this.request('PATCH', `/tasks/${encodeURIComponent(id)}`, patch);
  }

  deleteTask(id: string): Promise<void> {
    return this.request('DELETE', `/tasks/${encodeURIComponent(id)}`);
  }

  listOpenTasks(): Promise<{ tasks: WorkItemView[]; projects: ProjectView[] }> {
    return this.request('GET', '/tasks?open=true');
  }

  async listAttachments(target: AttachmentTarget): Promise<AttachmentView[]> {
    const q = `targetType=${target.type}&targetId=${encodeURIComponent(target.id)}`;
    return (await this.request<{ attachments: AttachmentView[] }>('GET', `/attachments?${q}`))
      .attachments;
  }

  addLink(target: AttachmentTarget, url: string, title?: string): Promise<AttachmentView> {
    return this.request('POST', '/attachments', {
      targetType: target.type,
      targetId: target.id,
      url,
      ...(title !== undefined && title !== '' ? { title } : {}),
    });
  }

  async uploadFile(target: AttachmentTarget, file: File): Promise<AttachmentView> {
    const q = `targetType=${target.type}&targetId=${encodeURIComponent(target.id)}&filename=${encodeURIComponent(file.name)}`;
    const res = await this.fetchImpl(`${this.baseUrl}/attachments/upload?${q}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-attachment-type': file.type || 'application/octet-stream',
        ...(await this.signed()),
      },
      body: file,
    });
    if (!res.ok)
      throw new ApiError(res.status, res.status === 413 ? 'file_too_large' : await errorCode(res));
    return (await res.json()) as AttachmentView;
  }

  /** Fetches a file attachment's bytes (requests are signed, so no plain href). */
  async downloadAttachment(id: string): Promise<Blob> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/attachments/${encodeURIComponent(id)}/content`,
      { headers: await this.signed() },
    );
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    return res.blob();
  }

  deleteAttachment(id: string): Promise<void> {
    return this.request('DELETE', `/attachments/${encodeURIComponent(id)}`);
  }

  // ── Donna's planning ─────────────────────────────────────────────────────

  /** Ask Donna to plan an objective. `today` is the user's local date. */
  startPlan(objectiveId: string, today: string, retry = false): Promise<PlanRecordView> {
    return this.request('POST', `/objectives/${encodeURIComponent(objectiveId)}/plan`, {
      today,
      ...(retry ? { retry: true } : {}),
    });
  }

  approvePlan(
    objectiveId: string,
    tasks?: number[],
  ): Promise<{ plan: PlanRecordView; projectId: string }> {
    return this.request(
      'POST',
      `/objectives/${encodeURIComponent(objectiveId)}/plan/approve`,
      tasks !== undefined ? { tasks } : {},
    );
  }

  dismissPlan(objectiveId: string): Promise<PlanRecordView> {
    return this.request('POST', `/objectives/${encodeURIComponent(objectiveId)}/plan/dismiss`, {});
  }

  /** Ask Donna to write a task's deliverable. */
  draftTask(taskId: string): Promise<WorkItemView> {
    return this.request('POST', `/tasks/${encodeURIComponent(taskId)}/draft`, {});
  }

  // ── Gmail ────────────────────────────────────────────────────────────────

  gmailStatus(): Promise<GmailStatus> {
    return this.request('GET', '/integrations/google');
  }

  /** The Google consent URL to send the browser to. */
  async connectGmail(): Promise<string> {
    return (await this.request<{ url: string }>('POST', '/integrations/google/connect', {})).url;
  }

  disconnectGmail(): Promise<void> {
    return this.request('DELETE', '/integrations/google');
  }

  async listEmails(taskId: string): Promise<OutboundEmailView[]> {
    const path = `/tasks/${encodeURIComponent(taskId)}/emails`;
    return (await this.request<{ emails: OutboundEmailView[] }>('GET', path)).emails;
  }

  /** Save to Gmail drafts, or (with `confirm`) send from the connected account. */
  emailTask(taskId: string, email: EmailRequest): Promise<OutboundEmailView> {
    return this.request('POST', `/tasks/${encodeURIComponent(taskId)}/email`, email);
  }
}
