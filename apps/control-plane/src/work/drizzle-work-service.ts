import type { AttachmentTarget, LinkProvider } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

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

const { clients, projects, sprints, workItems, attachments, attachmentFiles } = schema;

type ProjectRow = typeof projects.$inferSelect;
type SprintRow = typeof sprints.$inferSelect;
type WorkItemRow = typeof workItems.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;

const toProject = (r: ProjectRow): ProjectView => ({
  id: r.id,
  clientId: r.clientId,
  name: r.name,
  scope: r.scope,
  createdAt: r.createdAt.toISOString(),
});

const toSprint = (r: SprintRow): SprintView => ({
  id: r.id,
  projectId: r.projectId,
  name: r.name,
  status: r.status,
  startsOn: r.startsOn,
  endsOn: r.endsOn,
  createdAt: r.createdAt.toISOString(),
});

const toWorkItem = (r: WorkItemRow): WorkItemView => ({
  id: r.id,
  projectId: r.projectId,
  sprintId: r.sprintId,
  parentId: r.parentId,
  title: r.title,
  status: r.status,
  dueOn: r.dueOn,
  position: r.position,
  createdAt: r.createdAt.toISOString(),
  objectiveId: r.objectiveId,
  owner: r.owner,
  draft: r.draft,
  ...effectiveDraft(r.draftStatus, r.draftError, r.draftUpdatedAt),
});

function targetOf(r: AttachmentRow): AttachmentRef {
  if (r.clientId !== null) return { type: 'client', id: r.clientId };
  if (r.projectId !== null) return { type: 'project', id: r.projectId };
  if (r.sprintId !== null) return { type: 'sprint', id: r.sprintId };
  return { type: 'task', id: r.workItemId as string };
}

const toAttachment = (r: AttachmentRow): AttachmentView => ({
  id: r.id,
  target: targetOf(r),
  kind: r.kind,
  title: r.title,
  url: r.url,
  provider: r.provider as LinkProvider | null,
  contentType: r.contentType,
  sizeBytes: r.sizeBytes,
  createdAt: r.createdAt.toISOString(),
});

/** The attachments column (and table) that holds a given target type. */
const TARGET_COLUMN = {
  client: { column: attachments.clientId, field: 'clientId', table: clients },
  project: { column: attachments.projectId, field: 'projectId', table: projects },
  sprint: { column: attachments.sprintId, field: 'sprintId', table: sprints },
  task: { column: attachments.workItemId, field: 'workItemId', table: workItems },
} as const satisfies Record<AttachmentTarget, unknown>;

/**
 * Postgres-backed {@link WorkService}. Every query repeats the organization
 * predicate; the composite `(organization_id, id)` foreign keys are
 * defense-in-depth underneath (a cross-tenant parent is rejected by the DB).
 */
export class DrizzleWorkService implements WorkService {
  constructor(private readonly db: DonnaDatabase) {}

  // Clients

  private async clientViews(org: string, id?: string): Promise<ClientView[]> {
    const projectCount = this.db
      .select({ clientId: projects.clientId, n: count().as('n') })
      .from(projects)
      .where(eq(projects.organizationId, org))
      .groupBy(projects.clientId)
      .as('project_count');
    const rows = await this.db
      .select({ client: clients, n: projectCount.n })
      .from(clients)
      .leftJoin(projectCount, eq(projectCount.clientId, clients.id))
      .where(
        and(eq(clients.organizationId, org), id !== undefined ? eq(clients.id, id) : undefined),
      )
      .orderBy(asc(clients.name));
    return rows.map(({ client, n }) => ({
      id: client.id,
      name: client.name,
      status: client.status,
      notes: client.notes,
      projectCount: Number(n ?? 0),
      createdAt: client.createdAt.toISOString(),
    }));
  }

  async listClients(org: string): Promise<ClientView[]> {
    return this.clientViews(org);
  }

  async getClient(org: string, id: string): Promise<ClientView | null> {
    return (await this.clientViews(org, id))[0] ?? null;
  }

  async createClient(org: string, input: CreateClientInput): Promise<ClientView> {
    const [row] = await this.db
      .insert(clients)
      .values({
        organizationId: org,
        name: requireName(input.name),
        notes: input.notes?.trim() || null,
      })
      .returning();
    return { ...(await this.getClient(org, row!.id))! };
  }

  async updateClient(
    org: string,
    id: string,
    input: UpdateClientInput,
  ): Promise<ClientView | null> {
    const set = {
      ...(input.name !== undefined ? { name: requireName(input.name) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updatedAt: new Date(),
    };
    const updated = await this.db
      .update(clients)
      .set(set)
      .where(and(eq(clients.id, id), eq(clients.organizationId, org)))
      .returning({ id: clients.id });
    return updated.length === 0 ? null : this.getClient(org, id);
  }

  // Projects

  async listProjects(org: string, filter: { clientId?: string } = {}): Promise<ProjectView[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, org),
          filter.clientId !== undefined ? eq(projects.clientId, filter.clientId) : undefined,
        ),
      )
      .orderBy(asc(projects.name));
    return rows.map(toProject);
  }

  async getProject(org: string, id: string): Promise<ProjectView | null> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.organizationId, org)))
      .limit(1);
    return row === undefined ? null : toProject(row);
  }

  async createProject(org: string, input: CreateProjectInput): Promise<ProjectView> {
    const name = requireName(input.name);
    if (input.clientId !== null && (await this.getClient(org, input.clientId)) === null) {
      throw new WorkValidationError('client_not_found');
    }
    const [row] = await this.db
      .insert(projects)
      .values({ organizationId: org, name, clientId: input.clientId })
      .returning();
    return toProject(row!);
  }

  // Sprints

  async listSprints(org: string, projectId: string): Promise<SprintView[]> {
    const rows = await this.db
      .select()
      .from(sprints)
      .where(and(eq(sprints.organizationId, org), eq(sprints.projectId, projectId)))
      .orderBy(asc(sprints.createdAt));
    return rows.map(toSprint);
  }

  async getSprint(org: string, id: string): Promise<SprintView | null> {
    const [row] = await this.db
      .select()
      .from(sprints)
      .where(and(eq(sprints.id, id), eq(sprints.organizationId, org)))
      .limit(1);
    return row === undefined ? null : toSprint(row);
  }

  async createSprint(org: string, input: CreateSprintInput): Promise<SprintView> {
    const name = requireName(input.name);
    const startsOn = input.startsOn !== undefined ? requireDate(input.startsOn) : null;
    const endsOn = input.endsOn !== undefined ? requireDate(input.endsOn) : null;
    requireDateRange(startsOn, endsOn);
    if ((await this.getProject(org, input.projectId)) === null) {
      throw new WorkValidationError('project_not_found');
    }
    const [row] = await this.db
      .insert(sprints)
      .values({ organizationId: org, projectId: input.projectId, name, startsOn, endsOn })
      .returning();
    return toSprint(row!);
  }

  async updateSprint(
    org: string,
    id: string,
    input: UpdateSprintInput,
  ): Promise<SprintView | null> {
    const row = await this.getSprint(org, id);
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
    const [updated] = await this.db
      .update(sprints)
      .set({
        ...(input.name !== undefined ? { name: requireName(input.name) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        startsOn,
        endsOn,
        updatedAt: new Date(),
      })
      .where(and(eq(sprints.id, id), eq(sprints.organizationId, org)))
      .returning();
    return updated === undefined ? null : toSprint(updated);
  }

  // Tasks & subtasks

  async listWorkItems(
    org: string,
    filter: { projectId?: string; open?: boolean },
  ): Promise<WorkItemView[]> {
    const rows = await this.db
      .select()
      .from(workItems)
      .where(
        and(
          eq(workItems.organizationId, org),
          filter.projectId !== undefined ? eq(workItems.projectId, filter.projectId) : undefined,
          filter.open === true ? ne(workItems.status, 'done') : undefined,
        ),
      )
      .orderBy(asc(workItems.position), asc(workItems.createdAt));
    return rows.map(toWorkItem);
  }

  async getWorkItem(org: string, id: string): Promise<WorkItemView | null> {
    const [row] = await this.db
      .select()
      .from(workItems)
      .where(and(eq(workItems.id, id), eq(workItems.organizationId, org)))
      .limit(1);
    return row === undefined ? null : toWorkItem(row);
  }

  async createWorkItem(
    org: string,
    input: CreateWorkItemInput,
    createdBy: string,
  ): Promise<WorkItemView> {
    const title = requireName(input.title, 'title_required');
    const dueOn = input.dueOn !== undefined ? requireDate(input.dueOn) : null;
    if ((await this.getProject(org, input.projectId)) === null) {
      throw new WorkValidationError('project_not_found');
    }
    let sprintId = input.sprintId ?? null;
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const parent = await this.getWorkItem(org, parentId);
      if (parent === null || parent.projectId !== input.projectId) {
        throw new WorkValidationError('parent_not_found');
      }
      if (parent.parentId !== null) throw new WorkValidationError('subtasks_are_one_level');
      sprintId = parent.sprintId;
    } else if (sprintId !== null) {
      const sprint = await this.getSprint(org, sprintId);
      if (sprint === null || sprint.projectId !== input.projectId) {
        throw new WorkValidationError('sprint_not_found');
      }
    }
    const [row] = await this.db
      .insert(workItems)
      .values({
        organizationId: org,
        projectId: input.projectId,
        sprintId,
        parentId,
        title,
        dueOn,
        createdBy,
        objectiveId: input.objectiveId ?? null,
        owner: input.owner ?? 'you',
        // Append after the last sibling (same project, same parent).
        position: sql`(
          select coalesce(max(${workItems.position}) + 1, 0) from ${workItems}
          where ${workItems.organizationId} = ${org}
            and ${workItems.projectId} = ${input.projectId}
            and ${parentId === null ? isNull(workItems.parentId) : eq(workItems.parentId, parentId)}
        )`,
      })
      .returning();
    return toWorkItem(row!);
  }

  async updateWorkItem(
    org: string,
    id: string,
    input: UpdateWorkItemInput,
  ): Promise<WorkItemView | null> {
    const row = await this.getWorkItem(org, id);
    if (row === null) return null;
    if (input.sprintId !== undefined) {
      if (row.parentId !== null) throw new WorkValidationError('subtask_follows_parent');
      if (input.sprintId !== null) {
        const sprint = await this.getSprint(org, input.sprintId);
        if (sprint === null || sprint.projectId !== row.projectId) {
          throw new WorkValidationError('sprint_not_found');
        }
      }
    }
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workItems)
        .set({
          ...(input.title !== undefined
            ? { title: requireName(input.title, 'title_required') }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.dueOn !== undefined
            ? { dueOn: input.dueOn === null ? null : requireDate(input.dueOn) }
            : {}),
          ...(input.sprintId !== undefined ? { sprintId: input.sprintId } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, org)))
        .returning();
      // Subtasks follow their parent between sprints.
      if (input.sprintId !== undefined) {
        await tx
          .update(workItems)
          .set({ sprintId: input.sprintId, updatedAt: new Date() })
          .where(and(eq(workItems.organizationId, org), eq(workItems.parentId, id)));
      }
      return updated === undefined ? null : toWorkItem(updated);
    });
  }

  async setDraft(org: string, id: string, update: DraftUpdate): Promise<WorkItemView | null> {
    const [row] = await this.db
      .update(workItems)
      .set({
        draftStatus: update.status,
        ...(update.status === 'ready' ? { draft: update.draft } : {}),
        draftError: update.status === 'failed' ? update.error : null,
        draftUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(workItems.id, id), eq(workItems.organizationId, org)))
      .returning();
    return row === undefined ? null : toWorkItem(row);
  }

  async progressByObjective(
    org: string,
    objectiveIds: readonly string[],
  ): Promise<Record<string, ObjectiveProgress>> {
    if (objectiveIds.length === 0) return {};
    const rows = await this.db
      .select({
        objectiveId: workItems.objectiveId,
        total: count(),
        done: sql<number>`count(*) filter (where ${workItems.status} = 'done')`,
      })
      .from(workItems)
      .where(
        and(eq(workItems.organizationId, org), inArray(workItems.objectiveId, [...objectiveIds])),
      )
      .groupBy(workItems.objectiveId);
    const out: Record<string, ObjectiveProgress> = {};
    for (const r of rows) {
      if (r.objectiveId !== null)
        out[r.objectiveId] = { done: Number(r.done), total: Number(r.total) };
    }
    return out;
  }

  async deleteWorkItem(org: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(workItems)
      .where(and(eq(workItems.id, id), eq(workItems.organizationId, org)))
      .returning({ id: workItems.id });
    return deleted.length > 0;
  }

  // Attachments

  private async requireTarget(org: string, target: AttachmentRef): Promise<void> {
    const { table } = TARGET_COLUMN[target.type];
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, target.id), eq(table.organizationId, org)))
      .limit(1);
    if (row === undefined) throw new WorkValidationError('target_not_found');
  }

  async listAttachments(org: string, target: AttachmentRef): Promise<AttachmentView[]> {
    const rows = await this.db
      .select()
      .from(attachments)
      .where(
        and(eq(attachments.organizationId, org), eq(TARGET_COLUMN[target.type].column, target.id)),
      )
      .orderBy(asc(attachments.createdAt));
    return rows.map(toAttachment);
  }

  async getAttachment(org: string, id: string): Promise<AttachmentView | null> {
    const [row] = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.organizationId, org)))
      .limit(1);
    return row === undefined ? null : toAttachment(row);
  }

  async getAttachmentContent(org: string, id: string): Promise<AttachmentContent | null> {
    const [row] = await this.db
      .select({
        title: attachments.title,
        contentType: attachments.contentType,
        content: attachmentFiles.content,
      })
      .from(attachments)
      .innerJoin(
        attachmentFiles,
        and(
          eq(attachmentFiles.attachmentId, attachments.id),
          eq(attachmentFiles.organizationId, attachments.organizationId),
        ),
      )
      .where(and(eq(attachments.id, id), eq(attachments.organizationId, org)))
      .limit(1);
    if (row === undefined) return null;
    return {
      title: row.title,
      contentType: row.contentType ?? 'application/octet-stream',
      content: Buffer.from(row.content),
    };
  }

  async createLink(
    org: string,
    target: AttachmentRef,
    input: CreateLinkInput,
    createdBy: string,
  ): Promise<AttachmentView> {
    const { url, provider } = requireLink(input.url);
    const title = input.title?.trim() ? requireName(input.title) : linkTitle(url);
    await this.requireTarget(org, target);
    const [row] = await this.db
      .insert(attachments)
      .values({
        organizationId: org,
        [TARGET_COLUMN[target.type].field]: target.id,
        kind: 'link',
        title,
        url,
        provider,
        createdBy,
      })
      .returning();
    return toAttachment(row!);
  }

  async createFile(
    org: string,
    target: AttachmentRef,
    input: CreateFileInput,
    createdBy: string,
  ): Promise<AttachmentView> {
    const title = cleanFilename(input.filename);
    if (input.content.length === 0) throw new WorkValidationError('empty_file');
    await this.requireTarget(org, target);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attachments)
        .values({
          organizationId: org,
          [TARGET_COLUMN[target.type].field]: target.id,
          kind: 'file',
          title,
          contentType: cleanContentType(input.contentType),
          sizeBytes: input.content.length,
          createdBy,
        })
        .returning();
      await tx
        .insert(attachmentFiles)
        .values({ attachmentId: row!.id, organizationId: org, content: input.content });
      return toAttachment(row!);
    });
  }

  async deleteAttachment(org: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.organizationId, org)))
      .returning({ id: attachments.id });
    return deleted.length > 0;
  }
}
