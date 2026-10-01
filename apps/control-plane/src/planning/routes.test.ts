import { InMemoryEventBus } from '@donna/events';
import { describe, expect, it, vi } from 'vitest';

import { devAuthenticator } from '../auth/authenticate.js';
import { buildServer } from '../server.js';
import { InMemoryObjectiveService } from '../services/objective-service.js';
import { InMemoryTaskDispatcher } from '../services/task-dispatcher.js';
import { InMemoryTaskService } from '../services/task-service.js';
import { InMemoryWorkQueue } from '../services/work-queue.js';
import { InMemoryWorkService } from '../work/in-memory-work-service.js';
import { Background } from './background.js';
import { DonnaModelError, type DonnaModel } from './donna-model.js';
import type { Plan, PlanContext } from './plan.js';
import { PlanService } from './plan-service.js';
import { InMemoryPlanStore } from './plan-store.js';

const member = {
  'x-donna-user-id': 'u1',
  'x-donna-org-id': 'org1',
  'x-donna-role': 'team_member',
  'x-donna-actor-kind': 'human',
};
const outsider = { ...member, 'x-donna-user-id': 'u9', 'x-donna-org-id': 'org2' };

const PLAN: Plan = {
  summary: 'I’ll run the relaunch as a two-week sprint.',
  client: { kind: 'new', name: 'Acme Co' },
  project: { kind: 'new', name: 'Website relaunch' },
  sprint: { name: 'Launch sprint', startsOn: '2026-10-05', endsOn: '2026-10-16' },
  tasks: [
    { title: 'Draft launch email', subtasks: ['Subject line', 'Body'], owner: 'donna' },
    { title: 'Confirm DNS cutover', subtasks: [], owner: 'you' },
    { title: 'Write QA checklist', subtasks: [], owner: 'donna' },
  ],
  questions: ['Which domain?'],
};

function scriptedModel(overrides: Partial<DonnaModel> = {}) {
  const contexts: PlanContext[] = [];
  const model: DonnaModel = {
    plan: vi.fn(async (ctx: PlanContext) => {
      contexts.push(ctx);
      return { plan: PLAN, model: 'claude-opus-5-5', costUsd: 0.02 };
    }),
    draft: vi.fn(async (input) => ({
      markdown: `# ${input.task}`,
      model: 'claude-opus-5-5',
      costUsd: 0.01,
    })),
    ...overrides,
  };
  return { model, contexts };
}

function makeApp(model?: DonnaModel) {
  const bus = new InMemoryEventBus();
  const objectiveService = new InMemoryObjectiveService(bus);
  const work = new InMemoryWorkService();
  const background = new Background();
  const planning = new PlanService({
    work,
    objectives: objectiveService,
    plans: new InMemoryPlanStore(),
    background,
    ...(model !== undefined ? { model } : {}),
  });
  const app = buildServer({
    objectiveService,
    taskDispatcher: new InMemoryTaskDispatcher(
      new InMemoryTaskService(bus),
      new InMemoryWorkQueue(),
    ),
    authenticate: devAuthenticator(),
    work,
    planning,
  });
  return { app, background };
}

type App = ReturnType<typeof makeApp>['app'];

async function newObjective(app: App, outcome = 'Relaunch the Acme website by the 16th') {
  const res = await app.inject({
    method: 'POST',
    url: '/objectives',
    headers: member,
    payload: { requestedOutcome: outcome, definitionOfDone: 'To be defined with Donna' },
  });
  return res.json().id as string;
}

const post = (app: App, url: string, payload: Record<string, unknown> = {}, headers = member) =>
  app.inject({ method: 'POST', url, headers, payload });
const get = (app: App, url: string, headers = member) =>
  app.inject({ method: 'GET', url, headers });

describe('Donna planning API', () => {
  it('reports whether planning is available', async () => {
    expect((await get(makeApp().app, '/client-config')).json().planner).toBe(false);
    expect((await get(makeApp(scriptedModel().model).app, '/client-config')).json().planner).toBe(
      true,
    );
  });

  it('says planning is unconfigured without a model', async () => {
    const { app } = makeApp();
    const id = await newObjective(app);
    const res = await post(app, `/objectives/${id}/plan`);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'planner_unconfigured' });
  });

  it('runs outcome → plan → approval → tasks → drafts', async () => {
    const { model, contexts } = scriptedModel();
    const { app, background } = makeApp(model);
    const id = await newObjective(app);

    const start = await post(app, `/objectives/${id}/plan`, { today: '2026-10-01' });
    expect(start.statusCode).toBe(202);
    expect(start.json().status).toBe('drafting');
    await background.idle();
    expect(contexts[0]).toMatchObject({
      outcome: 'Relaunch the Acme website by the 16th',
      today: '2026-10-01',
    });

    const proposed = (await get(app, `/objectives/${id}/plan`)).json();
    expect(proposed).toMatchObject({ status: 'proposed', model: 'claude-opus-5-5', plan: PLAN });
    // Starting again while proposed is idempotent.
    expect((await post(app, `/objectives/${id}/plan`)).json().id).toBe(proposed.id);

    const list = (await get(app, '/objectives')).json().objectives;
    expect(list[0]).toMatchObject({ id, plan: { status: 'proposed' }, progress: null });

    const approve = await post(app, `/objectives/${id}/plan/approve`);
    expect(approve.statusCode).toBe(200);
    const { projectId } = approve.json();

    const project = (await get(app, `/projects/${projectId}`)).json();
    expect(project.client.name).toBe('Acme Co');
    expect(project.project.name).toBe('Website relaunch');
    expect(project.sprints).toMatchObject([
      { name: 'Launch sprint', startsOn: '2026-10-05', endsOn: '2026-10-16' },
    ]);
    const top = project.tasks.filter((t: { parentId: string | null }) => t.parentId === null);
    expect(top.map((t: { title: string }) => t.title)).toEqual([
      'Draft launch email',
      'Confirm DNS cutover',
      'Write QA checklist',
    ]);
    expect(project.tasks).toHaveLength(5);
    expect(
      top.every(
        (t: { sprintId: string; objectiveId: string }) =>
          t.sprintId === project.sprints[0].id && t.objectiveId === id,
      ),
    ).toBe(true);
    // Donna's own tasks are queued for drafting as soon as the plan is approved.
    expect(top.filter((t: { draftStatus: string }) => t.draftStatus !== 'none')).toHaveLength(2);

    await background.idle();
    const after = (await get(app, `/projects/${projectId}`)).json().tasks;
    const email = after.find((t: { title: string }) => t.title === 'Draft launch email');
    expect(email).toMatchObject({
      owner: 'donna',
      draftStatus: 'ready',
      draft: '# Draft launch email',
    });
    expect(model.draft).toHaveBeenCalledWith(
      expect.objectContaining({
        subtasks: ['Subject line', 'Body'],
        client: 'Acme Co',
        objective: 'Relaunch the Acme website by the 16th',
      }),
    );
    expect(
      after.find((t: { title: string }) => t.title === 'Confirm DNS cutover').draftStatus,
    ).toBe('none');

    const objectives = (await get(app, '/objectives')).json().objectives;
    expect(objectives[0]).toMatchObject({
      status: 'active',
      projectId,
      plan: { status: 'approved', projectId },
      progress: { done: 0, total: 5 },
    });

    // Approving twice, or replanning an approved objective, is a conflict.
    expect((await post(app, `/objectives/${id}/plan/approve`)).json()).toEqual({
      error: 'already_planned',
    });
    expect((await post(app, `/objectives/${id}/plan`, { retry: true })).json()).toEqual({
      error: 'already_planned',
    });
  });

  it('keeps only the selected tasks', async () => {
    const { app } = makeApp(scriptedModel().model);
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await new Promise((r) => setTimeout(r, 0));
    const { projectId } = (
      await post(app, `/objectives/${id}/plan/approve`, { tasks: [1] })
    ).json();
    const tasks = (await get(app, `/projects/${projectId}`)).json().tasks;
    expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Confirm DNS cutover']);
  });

  it('refuses an empty selection and malformed input', async () => {
    const { app, background } = makeApp(scriptedModel().model);
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await post(app, `/objectives/${id}/plan/approve`, { tasks: [] })).json()).toEqual({
      error: 'no_tasks_selected',
    });
    expect((await post(app, `/objectives/${id}/plan/approve`, { tasks: ['x'] })).json()).toEqual({
      error: 'invalid_tasks',
    });
  });

  it('records a model failure and allows a retry', async () => {
    const plan = vi
      .fn()
      .mockRejectedValueOnce(new DonnaModelError('declined'))
      .mockResolvedValue({ plan: PLAN, model: 'm', costUsd: 0 });
    const { app, background } = makeApp(scriptedModel({ plan }).model);
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await get(app, `/objectives/${id}/plan`)).json()).toMatchObject({
      status: 'failed',
      error: 'declined',
    });
    expect((await post(app, `/objectives/${id}/plan/approve`)).json()).toEqual({
      error: 'plan_not_ready',
    });
    // A failed plan redrafts on the next request.
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await get(app, `/objectives/${id}/plan`)).json().status).toBe('proposed');
  });

  it('dismisses a plan', async () => {
    const { app, background } = makeApp(scriptedModel().model);
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await post(app, `/objectives/${id}/plan/dismiss`)).json().status).toBe('dismissed');
  });

  it('refuses a plan whose existing project was removed (stale)', async () => {
    const { app, background } = makeApp(
      scriptedModel({
        plan: async () => ({
          plan: {
            ...PLAN,
            client: { kind: 'none' },
            project: { kind: 'existing', id: 'gone', name: 'Old' },
          },
          model: 'm',
          costUsd: 0,
        }),
      }).model,
    );
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await post(app, `/objectives/${id}/plan/approve`)).json()).toEqual({
      error: 'plan_stale',
    });
  });

  it('places work into the existing workspace it was given', async () => {
    const { model, contexts } = scriptedModel();
    const { app, background } = makeApp(model);
    const client = (await post(app, '/clients', { name: 'Acme Co' })).json();
    await post(app, '/projects', { name: 'Website', clientId: client.id });
    await post(app, '/projects', { name: 'Ops', clientId: null });
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect(contexts[0]!.clients).toEqual([
      { id: client.id, name: 'Acme Co', projects: [expect.objectContaining({ name: 'Website' })] },
    ]);
    expect(contexts[0]!.internalProjects).toEqual([expect.objectContaining({ name: 'Ops' })]);
  });

  it('isolates tenants', async () => {
    const { app, background } = makeApp(scriptedModel().model);
    const id = await newObjective(app);
    await post(app, `/objectives/${id}/plan`);
    await background.idle();
    expect((await get(app, `/objectives/${id}/plan`, outsider)).statusCode).toBe(404);
    expect((await post(app, `/objectives/${id}/plan`, {}, outsider)).statusCode).toBe(404);
    expect((await post(app, `/objectives/${id}/plan/approve`, {}, outsider)).statusCode).toBe(404);
    expect((await post(app, `/objectives/${id}/plan/dismiss`, {}, outsider)).statusCode).toBe(404);
  });

  it('drafts any task on request, once at a time', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const draft = vi.fn(async () => {
      await gate;
      return { markdown: 'Done.', model: 'm', costUsd: 0 };
    });
    const { app, background } = makeApp(scriptedModel({ draft }).model);
    const project = (await post(app, '/projects', { name: 'Site', clientId: null })).json();
    const task = (await post(app, `/projects/${project.id}/tasks`, { title: 'Write FAQ' })).json();

    const first = await post(app, `/tasks/${task.id}/draft`);
    expect(first.statusCode).toBe(202);
    expect(first.json().draftStatus).toBe('drafting');
    expect((await post(app, `/tasks/${task.id}/draft`)).json()).toEqual({
      error: 'draft_in_progress',
    });
    expect((await post(app, `/tasks/${task.id}/draft`, {}, outsider)).statusCode).toBe(404);
    release();
    await background.idle();
    expect((await get(app, `/tasks/${task.id}`)).json().task).toMatchObject({
      draftStatus: 'ready',
      draft: 'Done.',
    });
  });
});
