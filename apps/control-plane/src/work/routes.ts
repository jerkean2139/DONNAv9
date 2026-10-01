import {
  ATTACHMENT_TARGETS,
  CLIENT_STATUSES,
  SPRINT_STATUSES,
  WORK_ITEM_STATUSES,
  type AttachmentTarget,
} from '@donna/core-domain';
import {
  evaluate,
  type ActionDescriptor,
  type PrincipalContext,
  type ResourceDescriptor,
} from '@donna/policy';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { WORK_READ_ACTION, WORK_WRITE_ACTION } from '../actions.js';
import type { Authenticator } from '../auth/authenticate.js';
import {
  WorkValidationError,
  type AttachmentRef,
  type ProjectView,
  type WorkService,
} from './types.js';

/** Uploaded files are stored in Postgres; keep them to a sane size. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Types a browser may render inline; anything else downloads (no stored XSS). */
const INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

export interface WorkRouteDeps {
  readonly work: WorkService;
  readonly authenticate: Authenticator;
}

type Body = Record<string, unknown>;

function field(body: Body, key: string): string | undefined {
  const v = body[key];
  return typeof v === 'string' ? v : undefined;
}

/** A string or explicit null (for clearing); undefined when absent. */
function nullable(body: Body, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null) return null;
  if (typeof v === 'string') return v;
  throw new WorkValidationError(`invalid_${key}`);
}

function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[]): T | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw new WorkValidationError(`invalid_${key}`);
}

function projectResource(project: ProjectView, org: string): ResourceDescriptor {
  return {
    organizationId: org,
    scope: project.scope,
    ...(project.scope === 'PROJECT' ? { projectId: project.id } : {}),
  };
}

function orgResource(org: string): ResourceDescriptor {
  return { organizationId: org, scope: 'ORGANIZATION' };
}

function allowed(
  principal: PrincipalContext,
  action: ActionDescriptor,
  resource: ResourceDescriptor,
): boolean {
  return evaluate({ principal, action, resource }).effect === 'allow';
}

/**
 * The client work hierarchy API: Client → Project → Sprint → Task → Subtask,
 * with file and link attachments on every level. Each route authenticates,
 * resolves the record's owning project (or the org, for clients), and runs the
 * central policy engine. A record the caller may not read is a 404 —
 * indistinguishable from a missing one (SEC-2).
 */
export function registerWorkRoutes(app: FastifyInstance, deps: WorkRouteDeps): void {
  const { work } = deps;

  async function principalOf(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PrincipalContext | null> {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      await reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    return auth.principal;
  }

  /** The policy resource an attachment target inherits, or null if not found. */
  async function targetResource(
    org: string,
    ref: AttachmentRef,
  ): Promise<ResourceDescriptor | null> {
    let projectId: string;
    switch (ref.type) {
      case 'client':
        return (await work.getClient(org, ref.id)) === null ? null : orgResource(org);
      case 'project':
        projectId = ref.id;
        break;
      case 'sprint': {
        const sprint = await work.getSprint(org, ref.id);
        if (sprint === null) return null;
        projectId = sprint.projectId;
        break;
      }
      case 'task': {
        const item = await work.getWorkItem(org, ref.id);
        if (item === null) return null;
        projectId = item.projectId;
        break;
      }
    }
    const project = await work.getProject(org, projectId);
    return project === null ? null : projectResource(project, org);
  }

  function targetRef(type: unknown, id: unknown): AttachmentRef {
    if (typeof type !== 'string' || !(ATTACHMENT_TARGETS as readonly string[]).includes(type)) {
      throw new WorkValidationError('invalid_target_type');
    }
    if (typeof id !== 'string' || id === '') throw new WorkValidationError('invalid_target_id');
    return { type: type as AttachmentTarget, id };
  }

  // Validation errors from the service or input parsing are a 400.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkValidationError) {
      return reply.code(400).send({ error: error.code });
    }
    return reply.send(error);
  });

  // ── Clients ────────────────────────────────────────────────────────────────

  app.get('/clients', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    if (!allowed(principal, WORK_READ_ACTION, orgResource(org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return { clients: await work.listClients(org) };
  });

  app.post('/clients', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    if (!allowed(principal, WORK_WRITE_ACTION, orgResource(org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const notes = field(body, 'notes');
    const client = await work.createClient(org, {
      name: field(body, 'name') ?? '',
      ...(notes !== undefined ? { notes } : {}),
    });
    return reply.code(201).send(client);
  });

  app.get('/clients/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const client = await work.getClient(org, id);
    if (client === null || !allowed(principal, WORK_READ_ACTION, orgResource(org))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const projects = (await work.listProjects(org, { clientId: id })).filter((p) =>
      allowed(principal, WORK_READ_ACTION, projectResource(p, org)),
    );
    const attachments = await work.listAttachments(org, { type: 'client', id });
    return { client, projects, attachments };
  });

  app.patch('/clients/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    if ((await work.getClient(org, id)) === null)
      return reply.code(404).send({ error: 'not_found' });
    if (!allowed(principal, WORK_WRITE_ACTION, orgResource(org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const name = field(body, 'name');
    const status = oneOf(body, 'status', CLIENT_STATUSES);
    const notes = nullable(body, 'notes');
    const client = await work.updateClient(org, id, {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
    return client ?? reply.code(404).send({ error: 'not_found' });
  });

  // ── Projects ───────────────────────────────────────────────────────────────

  app.get('/projects', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { clientId } = request.query as { clientId?: string };
    const projects = (
      await work.listProjects(org, clientId !== undefined ? { clientId } : {})
    ).filter((p) => allowed(principal, WORK_READ_ACTION, projectResource(p, org)));
    return { projects };
  });

  app.post('/projects', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    if (!allowed(principal, WORK_WRITE_ACTION, orgResource(org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const clientId = nullable(body, 'clientId') ?? null;
    const project = await work.createProject(org, { name: field(body, 'name') ?? '', clientId });
    return reply.code(201).send(project);
  });

  app.get('/projects/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const project = await work.getProject(org, id);
    if (project === null || !allowed(principal, WORK_READ_ACTION, projectResource(project, org))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const [client, sprints, tasks, attachments] = await Promise.all([
      project.clientId === null ? null : work.getClient(org, project.clientId),
      work.listSprints(org, id),
      work.listWorkItems(org, { projectId: id }),
      work.listAttachments(org, { type: 'project', id }),
    ]);
    return { project, client, sprints, tasks, attachments };
  });

  // ── Sprints ────────────────────────────────────────────────────────────────

  app.post('/projects/:id/sprints', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const project = await work.getProject(org, id);
    if (project === null || !allowed(principal, WORK_READ_ACTION, projectResource(project, org))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, projectResource(project, org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const startsOn = field(body, 'startsOn');
    const endsOn = field(body, 'endsOn');
    const sprint = await work.createSprint(org, {
      projectId: id,
      name: field(body, 'name') ?? '',
      ...(startsOn !== undefined ? { startsOn } : {}),
      ...(endsOn !== undefined ? { endsOn } : {}),
    });
    return reply.code(201).send(sprint);
  });

  app.patch('/sprints/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const resource = await targetResource(org, { type: 'sprint', id });
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const name = field(body, 'name');
    const status = oneOf(body, 'status', SPRINT_STATUSES);
    const startsOn = nullable(body, 'startsOn');
    const endsOn = nullable(body, 'endsOn');
    const sprint = await work.updateSprint(org, id, {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(startsOn !== undefined ? { startsOn } : {}),
      ...(endsOn !== undefined ? { endsOn } : {}),
    });
    return sprint ?? reply.code(404).send({ error: 'not_found' });
  });

  // ── Tasks & subtasks ───────────────────────────────────────────────────────

  app.post('/projects/:id/tasks', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const project = await work.getProject(org, id);
    if (project === null || !allowed(principal, WORK_READ_ACTION, projectResource(project, org))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, projectResource(project, org))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const sprintId = nullable(body, 'sprintId');
    const parentId = nullable(body, 'parentId');
    const dueOn = field(body, 'dueOn');
    const task = await work.createWorkItem(
      org,
      {
        projectId: id,
        title: field(body, 'title') ?? '',
        ...(sprintId !== undefined ? { sprintId } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(dueOn !== undefined ? { dueOn } : {}),
      },
      principal.userId,
    );
    return reply.code(201).send(task);
  });

  // Open tasks across every project the caller can read (the "Tasks" view).
  app.get('/tasks', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { open } = request.query as { open?: string };
    const projects = (await work.listProjects(org)).filter((p) =>
      allowed(principal, WORK_READ_ACTION, projectResource(p, org)),
    );
    const readable = new Set(projects.map((p) => p.id));
    const tasks = (await work.listWorkItems(org, { open: open === 'true' })).filter((t) =>
      readable.has(t.projectId),
    );
    return { tasks, projects };
  });

  app.get('/tasks/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const task = await work.getWorkItem(org, id);
    const project = task === null ? null : await work.getProject(org, task.projectId);
    if (
      task === null ||
      project === null ||
      !allowed(principal, WORK_READ_ACTION, projectResource(project, org))
    ) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const [siblings, attachments] = await Promise.all([
      work.listWorkItems(org, { projectId: task.projectId }),
      work.listAttachments(org, { type: 'task', id }),
    ]);
    const subtasks = siblings.filter((w) => w.parentId === id);
    return { task, project, subtasks, attachments };
  });

  app.patch('/tasks/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const resource = await targetResource(org, { type: 'task', id });
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Body;
    const title = field(body, 'title');
    const status = oneOf(body, 'status', WORK_ITEM_STATUSES);
    const sprintId = nullable(body, 'sprintId');
    const dueOn = nullable(body, 'dueOn');
    const task = await work.updateWorkItem(org, id, {
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(sprintId !== undefined ? { sprintId } : {}),
      ...(dueOn !== undefined ? { dueOn } : {}),
    });
    return task ?? reply.code(404).send({ error: 'not_found' });
  });

  app.delete('/tasks/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const resource = await targetResource(org, { type: 'task', id });
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    await work.deleteWorkItem(org, id);
    return reply.code(204).send();
  });

  // ── Attachments ────────────────────────────────────────────────────────────

  app.get('/attachments', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { targetType, targetId } = request.query as { targetType?: string; targetId?: string };
    const ref = targetRef(targetType, targetId);
    const resource = await targetResource(org, ref);
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { attachments: await work.listAttachments(org, ref) };
  });

  // Attach a link (Google Drive, Docs, Dropbox, Figma, any https URL).
  app.post('/attachments', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const body = (request.body ?? {}) as Body;
    const ref = targetRef(body['targetType'], body['targetId']);
    const resource = await targetResource(org, ref);
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const title = field(body, 'title');
    const attachment = await work.createLink(
      org,
      ref,
      { url: field(body, 'url') ?? '', ...(title !== undefined ? { title } : {}) },
      principal.userId,
    );
    return reply.code(201).send(attachment);
  });

  // Upload a file: raw bytes as application/octet-stream; the real type rides
  // in `x-attachment-type` so a JSON/XML file is never parsed as a request body.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
      (_req, body, done) => done(null, body),
    );
    scope.post('/attachments/upload', { bodyLimit: MAX_UPLOAD_BYTES }, async (request, reply) => {
      const principal = await principalOf(request, reply);
      if (principal === null) return reply;
      const org = principal.organizationId;
      const query = request.query as { targetType?: string; targetId?: string; filename?: string };
      const ref = targetRef(query.targetType, query.targetId);
      const resource = await targetResource(org, ref);
      if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
        return reply.code(404).send({ error: 'not_found' });
      }
      if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!Buffer.isBuffer(request.body)) {
        return reply.code(415).send({ error: 'expected_octet_stream' });
      }
      const typeHeader = request.headers['x-attachment-type'];
      const attachment = await work.createFile(
        org,
        ref,
        {
          filename: query.filename ?? '',
          contentType: typeof typeHeader === 'string' ? typeHeader : 'application/octet-stream',
          content: request.body,
        },
        principal.userId,
      );
      return reply.code(201).send(attachment);
    });
  });

  app.get('/attachments/:id/content', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const attachment = await work.getAttachment(org, id);
    const resource = attachment === null ? null : await targetResource(org, attachment.target);
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const file = await work.getAttachmentContent(org, id);
    if (file === null) return reply.code(404).send({ error: 'not_found' });
    const inline = INLINE_TYPES.has(file.contentType);
    const name = encodeURIComponent(file.title);
    return reply
      .header('content-type', file.contentType)
      .header(
        'content-disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      )
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "sandbox; default-src 'none'")
      .header('cache-control', 'private, no-store')
      .send(file.content);
  });

  app.delete('/attachments/:id', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const attachment = await work.getAttachment(org, id);
    const resource = attachment === null ? null : await targetResource(org, attachment.target);
    if (resource === null || !allowed(principal, WORK_READ_ACTION, resource)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!allowed(principal, WORK_WRITE_ACTION, resource)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    await work.deleteAttachment(org, id);
    return reply.code(204).send();
  });
}
