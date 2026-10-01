import { randomUUID } from 'node:crypto';

import {
  effectiveDraft,
  cleanContentType,
  cleanFilename,
  linkTitle,
  requireDate,
  requireDateRange,
  requireLink,
  requireName,
} from './rules.js';
import {
  WorkValidationError,
  type AttachmentContent,
  type AttachmentRef,
  type AttachmentView,
  type ClientView,
  type CreateClientInput,
  type CreateFileInput,
  type CreateLinkInput,
  type CreateProjectInput,
  type CreateSprintInput,
  type CreateWorkItemInput,
  type DraftUpdate,
  type ObjectiveProgress,
  type ProjectView,
  type SprintView,
  type UpdateClientInput,
  type UpdateSprintInput,
  type UpdateWorkItemInput,
  type WorkItemView,
  type WorkService,
} from './types.js';

type Owned<T> = T & { readonly org: string };
type StoredItem = Owned<WorkItemView> & { readonly draftUpdatedAt: Date | null };
type StoredClient = Owned<Omit<ClientView, 'projectCount'>>;

/**
 * In-memory {@link WorkService} for tests and database-free development. It
 * applies exactly the same hierarchy rules as the Postgres service.
 */
export class InMemoryWorkService implements WorkService {
  private readonly clients = new Map<string, StoredClient>();
  private readonly projects = new Map<string, Owned<ProjectView>>();
  private readonly sprints = new Map<string, Owned<SprintView>>();
  private readonly items = new Map<string, StoredItem>();
  private readonly attachments = new Map<string, Owned<AttachmentView>>();
  private readonly files = new Map<string, Buffer>();
  private clock = 0;

  /** Strictly increasing timestamps so ordering is deterministic in tests. */
  private now(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.clock).toISOString();
  }

  private owned<T extends { org: string }>(map: Map<string, T>, org: string, id: string): T | null {
    const row = map.get(id);
    return row !== undefined && row.org === org ? row : null;
  }

  private strip<T extends { org: string }>(row: T): Omit<T, 'org'> {
    const rest: Partial<T> = { ...row };
    delete rest.org;
    return rest as Omit<T, 'org'>;
  }

  private itemView(row: StoredItem): WorkItemView {
    const { draftUpdatedAt, ...rest } = this.strip(row);
    return { ...rest, ...effectiveDraft(row.draftStatus, row.draftError, draftUpdatedAt) };
  }

  private clientView(row: StoredClient): ClientView {
    const projectCount = [...this.projects.values()].filter(
      (p) => p.org === row.org && p.clientId === row.id,
    ).length;
    return { ...this.strip(row), projectCount };
  }

  // Clients

  async listClients(org: string): Promise<ClientView[]> {
    return [...this.clients.values()]
      .filter((c) => c.org === org)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => this.clientView(c));
  }

  async getClient(org: string, id: string): Promise<ClientView | null> {
    const row = this.owned(this.clients, org, id);
    return row === null ? null : this.clientView(row);
  }

  async createClient(org: string, input: CreateClientInput): Promise<ClientView> {
    const row: StoredClient = {
      org,
      id: randomUUID(),
      name: requireName(input.name),
      status: 'active',
      notes: input.notes?.trim() || null,
      createdAt: this.now(),
    };
    this.clients.set(row.id, row);
    return this.clientView(row);
  }

  async updateClient(
    org: string,
    id: string,
    input: UpdateClientInput,
  ): Promise<ClientView | null> {
    const row = this.owned(this.clients, org, id);
    if (row === null) return null;
    const next: StoredClient = {
      ...row,
      ...(input.name !== undefined ? { name: requireName(input.name) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    };
    this.clients.set(id, next);
    return this.clientView(next);
  }

  // Projects

  async listProjects(org: string, filter: { clientId?: string } = {}): Promise<ProjectView[]> {
    return [...this.projects.values()]
      .filter(
        (p) => p.org === org && (filter.clientId === undefined || p.clientId === filter.clientId),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => this.strip(p));
  }

  async getProject(org: string, id: string): Promise<ProjectView | null> {
    const row = this.owned(this.projects, org, id);
    return row === null ? null : this.strip(row);
  }

  async createProject(org: string, input: CreateProjectInput): Promise<ProjectView> {
    const name = requireName(input.name);
    if (input.clientId !== null && this.owned(this.clients, org, input.clientId) === null) {
      throw new WorkValidationError('client_not_found');
    }
    const row: Owned<ProjectView> = {
      org,
      id: randomUUID(),
      clientId: input.clientId,
      name,
      scope: 'ORGANIZATION',
      createdAt: this.now(),
    };
    this.projects.set(row.id, row);
    return this.strip(row);
  }

  // Sprints

  async listSprints(org: string, projectId: string): Promise<SprintView[]> {
    return [...this.sprints.values()]
      .filter((s) => s.org === org && s.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => this.strip(s));
  }

  async getSprint(org: string, id: string): Promise<SprintView | null> {
    const row = this.owned(this.sprints, org, id);
    return row === null ? null : this.strip(row);
  }

  async createSprint(org: string, input: CreateSprintInput): Promise<SprintView> {
    const name = requireName(input.name);
    const startsOn = input.startsOn !== undefined ? requireDate(input.startsOn) : null;
    const endsOn = input.endsOn !== undefined ? requireDate(input.endsOn) : null;
    requireDateRange(startsOn, endsOn);
    if (this.owned(this.projects, org, input.projectId) === null) {
      throw new WorkValidationError('project_not_found');
    }
    const row: Owned<SprintView> = {
      org,
      id: randomUUID(),
      projectId: input.projectId,
      name,
      status: 'planned',
      startsOn,
      endsOn,
      createdAt: this.now(),
    };
    this.sprints.set(row.id, row);
    return this.strip(row);
  }

  async updateSprint(
    org: string,
    id: string,
    input: UpdateSprintInput,
  ): Promise<SprintView | null> {
    const row = this.owned(this.sprints, org, id);
    if (row === null) return null;
    const startsOn =
      input.startsOn === undefined
        ? row.startsOn
        : input.startsOn === null
          ? null
          : requireDate(input.startsOn);
    const endsOn =
      input.endsOn === undefined
        ? row.endsOn
        : input.endsOn === null
          ? null
          : requireDate(input.endsOn);
    requireDateRange(startsOn, endsOn);
    const next: Owned<SprintView> = {
      ...row,
      ...(input.name !== undefined ? { name: requireName(input.name) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      startsOn,
      endsOn,
    };
    this.sprints.set(id, next);
    return this.strip(next);
  }

  // Tasks & subtasks

  async listWorkItems(
    org: string,
    filter: { projectId?: string; open?: boolean },
  ): Promise<WorkItemView[]> {
    return [...this.items.values()]
      .filter(
        (w) =>
          w.org === org &&
          (filter.projectId === undefined || w.projectId === filter.projectId) &&
          (filter.open !== true || w.status !== 'done'),
      )
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
      .map((w) => this.itemView(w));
  }

  async getWorkItem(org: string, id: string): Promise<WorkItemView | null> {
    const row = this.owned(this.items, org, id);
    return row === null ? null : this.itemView(row);
  }

  async createWorkItem(org: string, input: CreateWorkItemInput): Promise<WorkItemView> {
    const title = requireName(input.title, 'title_required');
    const dueOn = input.dueOn !== undefined ? requireDate(input.dueOn) : null;
    if (this.owned(this.projects, org, input.projectId) === null) {
      throw new WorkValidationError('project_not_found');
    }
    let sprintId = input.sprintId ?? null;
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const parent = this.owned(this.items, org, parentId);
      if (parent === null || parent.projectId !== input.projectId) {
        throw new WorkValidationError('parent_not_found');
      }
      if (parent.parentId !== null) throw new WorkValidationError('subtasks_are_one_level');
      // A subtask always lives in its parent's sprint.
      sprintId = parent.sprintId;
    } else if (sprintId !== null) {
      const sprint = this.owned(this.sprints, org, sprintId);
      if (sprint === null || sprint.projectId !== input.projectId) {
        throw new WorkValidationError('sprint_not_found');
      }
    }
    const siblings = [...this.items.values()].filter(
      (w) => w.org === org && w.projectId === input.projectId && w.parentId === parentId,
    );
    const row: StoredItem = {
      org,
      id: randomUUID(),
      projectId: input.projectId,
      sprintId,
      parentId,
      title,
      status: 'todo',
      dueOn,
      position: siblings.reduce((max, w) => Math.max(max, w.position + 1), 0),
      createdAt: this.now(),
      objectiveId: input.objectiveId ?? null,
      owner: input.owner ?? 'you',
      draft: null,
      draftStatus: 'none',
      draftError: null,
      draftUpdatedAt: null,
    };
    this.items.set(row.id, row);
    return this.itemView(row);
  }

  async updateWorkItem(
    org: string,
    id: string,
    input: UpdateWorkItemInput,
  ): Promise<WorkItemView | null> {
    const row = this.owned(this.items, org, id);
    if (row === null) return null;
    let sprintId = row.sprintId;
    if (input.sprintId !== undefined) {
      if (row.parentId !== null) throw new WorkValidationError('subtask_follows_parent');
      if (input.sprintId !== null) {
        const sprint = this.owned(this.sprints, org, input.sprintId);
        if (sprint === null || sprint.projectId !== row.projectId) {
          throw new WorkValidationError('sprint_not_found');
        }
      }
      sprintId = input.sprintId;
    }
    const next: StoredItem = {
      ...row,
      ...(input.title !== undefined ? { title: requireName(input.title, 'title_required') } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueOn !== undefined
        ? { dueOn: input.dueOn === null ? null : requireDate(input.dueOn) }
        : {}),
      sprintId,
    };
    this.items.set(id, next);
    if (sprintId !== row.sprintId) {
      for (const child of this.items.values()) {
        if (child.org === org && child.parentId === id)
          this.items.set(child.id, { ...child, sprintId });
      }
    }
    return this.itemView(next);
  }

  async setDraft(org: string, id: string, update: DraftUpdate): Promise<WorkItemView | null> {
    const row = this.owned(this.items, org, id);
    if (row === null) return null;
    const next: StoredItem = {
      ...row,
      draftStatus: update.status,
      draft: update.status === 'ready' ? update.draft : row.draft,
      draftError: update.status === 'failed' ? update.error : null,
      draftUpdatedAt: new Date(),
    };
    this.items.set(id, next);
    return this.itemView(next);
  }

  async progressByObjective(
    org: string,
    objectiveIds: readonly string[],
  ): Promise<Record<string, ObjectiveProgress>> {
    const out: Record<string, ObjectiveProgress> = {};
    for (const w of this.items.values()) {
      if (w.org !== org || w.objectiveId === null || !objectiveIds.includes(w.objectiveId))
        continue;
      const p = out[w.objectiveId] ?? { done: 0, total: 0 };
      out[w.objectiveId] = { done: p.done + (w.status === 'done' ? 1 : 0), total: p.total + 1 };
    }
    return out;
  }

  async deleteWorkItem(org: string, id: string): Promise<boolean> {
    const row = this.owned(this.items, org, id);
    if (row === null) return false;
    const doomed = new Set([id]);
    for (const w of this.items.values()) if (w.org === org && w.parentId === id) doomed.add(w.id);
    for (const itemId of doomed) {
      this.items.delete(itemId);
      for (const a of [...this.attachments.values()]) {
        if (a.target.type === 'task' && a.target.id === itemId) {
          this.attachments.delete(a.id);
          this.files.delete(a.id);
        }
      }
    }
    return true;
  }

  // Attachments

  private requireTarget(org: string, target: AttachmentRef): void {
    const map = {
      client: this.clients,
      project: this.projects,
      sprint: this.sprints,
      task: this.items,
    }[target.type] as Map<string, { org: string }>;
    if (this.owned(map, org, target.id) === null) throw new WorkValidationError('target_not_found');
  }

  async listAttachments(org: string, target: AttachmentRef): Promise<AttachmentView[]> {
    return [...this.attachments.values()]
      .filter((a) => a.org === org && a.target.type === target.type && a.target.id === target.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) => this.strip(a));
  }

  async getAttachment(org: string, id: string): Promise<AttachmentView | null> {
    const row = this.owned(this.attachments, org, id);
    return row === null ? null : this.strip(row);
  }

  async getAttachmentContent(org: string, id: string): Promise<AttachmentContent | null> {
    const row = this.owned(this.attachments, org, id);
    const content = this.files.get(id);
    if (row === null || row.kind !== 'file' || content === undefined) return null;
    return {
      title: row.title,
      contentType: row.contentType ?? 'application/octet-stream',
      content,
    };
  }

  async createLink(
    org: string,
    target: AttachmentRef,
    input: CreateLinkInput,
  ): Promise<AttachmentView> {
    const { url, provider } = requireLink(input.url);
    this.requireTarget(org, target);
    const row: Owned<AttachmentView> = {
      org,
      id: randomUUID(),
      target,
      kind: 'link',
      title: input.title?.trim() ? requireName(input.title) : linkTitle(url),
      url,
      provider,
      contentType: null,
      sizeBytes: null,
      createdAt: this.now(),
    };
    this.attachments.set(row.id, row);
    return this.strip(row);
  }

  async createFile(
    org: string,
    target: AttachmentRef,
    input: CreateFileInput,
  ): Promise<AttachmentView> {
    const title = cleanFilename(input.filename);
    if (input.content.length === 0) throw new WorkValidationError('empty_file');
    this.requireTarget(org, target);
    const row: Owned<AttachmentView> = {
      org,
      id: randomUUID(),
      target,
      kind: 'file',
      title,
      url: null,
      provider: null,
      contentType: cleanContentType(input.contentType),
      sizeBytes: input.content.length,
      createdAt: this.now(),
    };
    this.attachments.set(row.id, row);
    this.files.set(row.id, Buffer.from(input.content));
    return this.strip(row);
  }

  async deleteAttachment(org: string, id: string): Promise<boolean> {
    if (this.owned(this.attachments, org, id) === null) return false;
    this.attachments.delete(id);
    this.files.delete(id);
    return true;
  }
}
