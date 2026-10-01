import type {
  AttachmentTarget,
  AttachmentView,
  ClientView,
  ProjectView,
  SprintView,
  WorkItemView,
} from '../types';

/**
 * A tiny in-memory stand-in for the work-hierarchy half of ControlPlaneClient,
 * so UI tests exercise real flows (add client → project → task…) without HTTP.
 */
export function fakeWork() {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const clients: ClientView[] = [];
  const projects: ProjectView[] = [];
  const sprints: SprintView[] = [];
  const tasks: WorkItemView[] = [];
  const attachments: AttachmentView[] = [];
  const now = '2026-10-01T00:00:00.000Z';
  const count = (cid: string) => projects.filter((p) => p.clientId === cid).length;
  const attachFor = (t: AttachmentTarget) =>
    attachments.filter((a) => a.target.type === t.type && a.target.id === t.id);

  return {
    async listClients() {
      return clients.map((c) => ({ ...c, projectCount: count(c.id) }));
    },
    async createClient(name: string) {
      const c: ClientView = {
        id: id('c'),
        name,
        status: 'active',
        notes: null,
        projectCount: 0,
        createdAt: now,
      };
      clients.push(c);
      return c;
    },
    async getClient(cid: string) {
      const client = clients.find((c) => c.id === cid)!;
      return {
        client: { ...client, projectCount: count(cid) },
        projects: projects.filter((p) => p.clientId === cid),
        attachments: attachFor({ type: 'client', id: cid }),
      };
    },
    async listProjects() {
      return projects;
    },
    async createProject(name: string, clientId: string | null) {
      const p: ProjectView = { id: id('p'), clientId, name, createdAt: now };
      projects.push(p);
      return p;
    },
    async getProject(pid: string) {
      const project = projects.find((p) => p.id === pid)!;
      return {
        project,
        client: clients.find((c) => c.id === project.clientId) ?? null,
        sprints: sprints.filter((s) => s.projectId === pid),
        tasks: tasks.filter((t) => t.projectId === pid),
        attachments: attachFor({ type: 'project', id: pid }),
      };
    },
    async createSprint(
      projectId: string,
      input: { name: string; startsOn?: string; endsOn?: string },
    ) {
      const s: SprintView = {
        id: id('s'),
        projectId,
        name: input.name,
        status: 'planned',
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
      };
      sprints.push(s);
      return s;
    },
    async createTask(
      projectId: string,
      input: { title: string; sprintId?: string | null; parentId?: string | null },
    ) {
      const parent = tasks.find((t) => t.id === input.parentId);
      const t: WorkItemView = {
        id: id('t'),
        projectId,
        sprintId: parent ? parent.sprintId : (input.sprintId ?? null),
        parentId: input.parentId ?? null,
        title: input.title,
        status: 'todo',
        dueOn: null,
        position: tasks.length,
      };
      tasks.push(t);
      return t;
    },
    async getTask(tid: string) {
      const task = tasks.find((t) => t.id === tid)!;
      return {
        task,
        project: projects.find((p) => p.id === task.projectId)!,
        subtasks: tasks.filter((t) => t.parentId === tid),
        attachments: attachFor({ type: 'task', id: tid }),
      };
    },
    async updateTask(tid: string, patch: Partial<WorkItemView>) {
      const i = tasks.findIndex((t) => t.id === tid);
      tasks[i] = { ...tasks[i]!, ...patch };
      return tasks[i]!;
    },
    async deleteTask(tid: string) {
      const i = tasks.findIndex((t) => t.id === tid);
      tasks.splice(i, 1);
    },
    async listOpenTasks() {
      return { tasks: tasks.filter((t) => t.status !== 'done'), projects };
    },
    async addLink(target: AttachmentTarget, url: string, title?: string) {
      const a: AttachmentView = {
        id: id('a'),
        target,
        kind: 'link',
        title: title ?? url.replace(/^https?:\/\//, ''),
        url,
        provider: url.includes('drive.google.com') ? 'google_drive' : 'web',
        contentType: null,
        sizeBytes: null,
        createdAt: now,
      };
      attachments.push(a);
      return a;
    },
    async uploadFile(target: AttachmentTarget, file: File) {
      const a: AttachmentView = {
        id: id('a'),
        target,
        kind: 'file',
        title: file.name,
        url: null,
        provider: null,
        contentType: file.type,
        sizeBytes: file.size,
        createdAt: now,
      };
      attachments.push(a);
      return a;
    },
    async deleteAttachment(aid: string) {
      attachments.splice(
        attachments.findIndex((a) => a.id === aid),
        1,
      );
    },
    async downloadAttachment() {
      return new Blob(['x']);
    },
  };
}
