import type { WorkService } from '../work/types.js';
import { DEMO_CLIENT, DEMO_MARKER, type DemoClient, type DemoTask } from './demo-data.js';

const SPRINT_DAYS = 14;

export interface DemoCounts {
  readonly clients: number;
  readonly projects: number;
  readonly sprints: number;
  readonly tasks: number;
  readonly subtasks: number;
}

/** The demo client already exists in this organization (seed is one-shot). */
export class DemoAlreadySeededError extends Error {
  constructor() {
    super('demo_already_seeded');
    this.name = 'DemoAlreadySeededError';
  }
}

function isoDate(base: Date, offsetDays: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** A sprint's status follows its dates relative to today. */
function sprintStatus(startOffset: number): 'planned' | 'active' | 'completed' {
  if (startOffset + SPRINT_DAYS <= 0) return 'completed';
  return startOffset <= 0 ? 'active' : 'planned';
}

async function demoClientIds(work: WorkService, org: string): Promise<string[]> {
  return (await work.listClients(org))
    .filter((c) => (c.notes ?? '').startsWith(DEMO_MARKER))
    .map((c) => c.id);
}

/**
 * Create the demo client, its projects, sprints, tasks and subtasks in `org`.
 * Sprint dates are relative to `today`, so the demo always has one finished,
 * one in-flight and upcoming sprints. Throws {@link DemoAlreadySeededError}
 * when the demo client is already there.
 */
export async function seedDemo(
  work: WorkService,
  org: string,
  userId: string,
  today: Date = new Date(),
  data: DemoClient = DEMO_CLIENT,
): Promise<DemoCounts> {
  if ((await demoClientIds(work, org)).length > 0) throw new DemoAlreadySeededError();
  const counts = { clients: 1, projects: 0, sprints: 0, tasks: 0, subtasks: 0 };

  async function addTask(projectId: string, sprintId: string | null, t: DemoTask) {
    const task = await work.createWorkItem(
      org,
      { projectId, title: t.title, sprintId, ...(t.owner !== undefined ? { owner: t.owner } : {}) },
      userId,
    );
    if (t.status !== undefined && t.status !== 'todo') {
      await work.updateWorkItem(org, task.id, { status: t.status });
    }
    counts.tasks += 1;
    for (const s of t.subtasks ?? []) {
      const sub = typeof s === 'string' ? { title: s, status: 'todo' as const } : s;
      const row = await work.createWorkItem(
        org,
        { projectId, title: sub.title, parentId: task.id },
        userId,
      );
      if (sub.status !== 'todo') await work.updateWorkItem(org, row.id, { status: sub.status });
      counts.subtasks += 1;
    }
  }

  const client = await work.createClient(org, { name: data.name, notes: data.notes });
  for (const p of data.projects) {
    const project = await work.createProject(org, { name: p.name, clientId: client.id });
    counts.projects += 1;
    for (const s of p.sprints) {
      const sprint = await work.createSprint(org, {
        projectId: project.id,
        name: s.name,
        startsOn: isoDate(today, s.startOffsetDays),
        endsOn: isoDate(today, s.startOffsetDays + SPRINT_DAYS - 1),
      });
      const status = sprintStatus(s.startOffsetDays);
      if (status !== 'planned') await work.updateSprint(org, sprint.id, { status });
      counts.sprints += 1;
      for (const t of s.tasks) await addTask(project.id, sprint.id, t);
    }
    for (const t of p.backlog ?? []) await addTask(project.id, null, t);
  }
  return counts;
}

/**
 * Remove every demo client in `org` and all of its projects (their sprints,
 * tasks, subtasks and attachments cascade). Only clients carrying the demo
 * marker are touched. Returns how many clients were removed.
 */
export async function removeDemo(work: WorkService, org: string): Promise<number> {
  const ids = await demoClientIds(work, org);
  for (const clientId of ids) {
    for (const project of await work.listProjects(org, { clientId })) {
      await work.deleteProject(org, project.id);
    }
    await work.deleteClient(org, clientId);
  }
  return ids.length;
}
