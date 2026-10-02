import type {
  AttachmentKind,
  AttachmentTarget,
  ClientStatus,
  DraftStatus,
  LinkProvider,
  Scope,
  SprintStatus,
  WorkItemOwner,
  WorkItemStatus,
} from '@donna/core-domain';

// API shapes for the client work hierarchy. Dates are ISO strings (`YYYY-MM-DD`
// for calendar dates) so the in-memory and Postgres services agree exactly.

export interface ClientView {
  readonly id: string;
  readonly name: string;
  readonly status: ClientStatus;
  readonly notes: string | null;
  readonly projectCount: number;
  readonly createdAt: string;
}

export interface ProjectView {
  readonly id: string;
  readonly clientId: string | null;
  readonly name: string;
  readonly scope: Scope;
  readonly createdAt: string;
}

export interface SprintView {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: SprintStatus;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly createdAt: string;
}

export interface WorkItemView {
  readonly id: string;
  readonly projectId: string;
  readonly sprintId: string | null;
  /** Set for a subtask: the task it belongs to. */
  readonly parentId: string | null;
  readonly title: string;
  readonly status: WorkItemStatus;
  readonly dueOn: string | null;
  readonly position: number;
  readonly createdAt: string;
  /** The objective Donna planned this from, if any. */
  readonly objectiveId: string | null;
  readonly owner: WorkItemOwner;
  /** Donna's markdown draft, for tasks she owns. */
  readonly draft: string | null;
  /** A `drafting` draft that has stalled past the timeout reads as `failed`. */
  readonly draftStatus: DraftStatus;
  readonly draftError: string | null;
}

export interface AttachmentView {
  readonly id: string;
  readonly target: AttachmentRef;
  readonly kind: AttachmentKind;
  readonly title: string;
  /** Links only. Files are fetched from `GET /attachments/:id/content`. */
  readonly url: string | null;
  readonly provider: LinkProvider | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly createdAt: string;
}

export interface AttachmentRef {
  readonly type: AttachmentTarget;
  readonly id: string;
}

export interface CreateClientInput {
  readonly name: string;
  readonly notes?: string;
}

export interface UpdateClientInput {
  readonly name?: string;
  readonly status?: ClientStatus;
  readonly notes?: string | null;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly clientId: string | null;
}

export interface CreateSprintInput {
  readonly projectId: string;
  readonly name: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
}

export interface UpdateSprintInput {
  readonly name?: string;
  readonly status?: SprintStatus;
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
}

export interface CreateWorkItemInput {
  readonly projectId: string;
  readonly title: string;
  readonly sprintId?: string | null;
  readonly parentId?: string | null;
  readonly dueOn?: string;
  readonly objectiveId?: string | null;
  readonly owner?: WorkItemOwner;
}

export type DraftUpdate =
  | { readonly status: 'drafting' }
  | { readonly status: 'ready'; readonly draft: string }
  | { readonly status: 'failed'; readonly error: string };

export interface ObjectiveProgress {
  readonly done: number;
  readonly total: number;
}

export interface UpdateWorkItemInput {
  readonly title?: string;
  readonly status?: WorkItemStatus;
  readonly sprintId?: string | null;
  readonly dueOn?: string | null;
}

export interface CreateLinkInput {
  readonly url: string;
  readonly title?: string;
}

export interface CreateFileInput {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Buffer;
}

export interface AttachmentContent {
  readonly title: string;
  readonly contentType: string;
  readonly content: Buffer;
}

/** A request the hierarchy rules reject (400). `code` is stable for clients. */
export class WorkValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WorkValidationError';
  }
}

/**
 * Tenant-scoped persistence for the work hierarchy. Every method takes the
 * organization explicitly and treats another tenant's rows as not found. It
 * enforces structural rules (a sprint belongs to the task's project, subtasks
 * are one level deep…); authorization (scope/role) is the route's policy gate.
 */
export interface WorkService {
  listClients(org: string): Promise<ClientView[]>;
  getClient(org: string, id: string): Promise<ClientView | null>;
  createClient(org: string, input: CreateClientInput): Promise<ClientView>;
  updateClient(org: string, id: string, input: UpdateClientInput): Promise<ClientView | null>;
  /** Deletes a client and its attachments; its projects stay, with no client. */
  deleteClient(org: string, id: string): Promise<boolean>;

  listProjects(org: string, filter?: { clientId?: string }): Promise<ProjectView[]>;
  getProject(org: string, id: string): Promise<ProjectView | null>;
  createProject(org: string, input: CreateProjectInput): Promise<ProjectView>;
  /** Deletes a project and (by cascade) its sprints, tasks, subtasks and attachments. */
  deleteProject(org: string, id: string): Promise<boolean>;

  listSprints(org: string, projectId: string): Promise<SprintView[]>;
  getSprint(org: string, id: string): Promise<SprintView | null>;
  createSprint(org: string, input: CreateSprintInput): Promise<SprintView>;
  updateSprint(org: string, id: string, input: UpdateSprintInput): Promise<SprintView | null>;

  listWorkItems(
    org: string,
    filter: { projectId?: string; open?: boolean },
  ): Promise<WorkItemView[]>;
  getWorkItem(org: string, id: string): Promise<WorkItemView | null>;
  createWorkItem(org: string, input: CreateWorkItemInput, createdBy: string): Promise<WorkItemView>;
  updateWorkItem(org: string, id: string, input: UpdateWorkItemInput): Promise<WorkItemView | null>;
  /** Deletes a task and (by cascade) its subtasks and attachments. */
  deleteWorkItem(org: string, id: string): Promise<boolean>;
  /** Record Donna's draft lifecycle for a task. */
  setDraft(org: string, id: string, update: DraftUpdate): Promise<WorkItemView | null>;
  /** Tasks done / total per objective (subtasks included), for the given ids. */
  progressByObjective(
    org: string,
    objectiveIds: readonly string[],
  ): Promise<Record<string, ObjectiveProgress>>;

  listAttachments(org: string, target: AttachmentRef): Promise<AttachmentView[]>;
  getAttachment(org: string, id: string): Promise<AttachmentView | null>;
  getAttachmentContent(org: string, id: string): Promise<AttachmentContent | null>;
  createLink(
    org: string,
    target: AttachmentRef,
    input: CreateLinkInput,
    createdBy: string,
  ): Promise<AttachmentView>;
  createFile(
    org: string,
    target: AttachmentRef,
    input: CreateFileInput,
    createdBy: string,
  ): Promise<AttachmentView>;
  deleteAttachment(org: string, id: string): Promise<boolean>;
}
