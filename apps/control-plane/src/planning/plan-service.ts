import type { Objective } from '@donna/core-domain';

import type { ObjectiveService } from '../services/objective-service.js';
import {
  WorkValidationError,
  type ObjectiveProgress,
  type WorkItemView,
  type WorkService,
} from '../work/types.js';
import type { Background } from './background.js';
import { DonnaModelError, type DonnaModel } from './donna-model.js';
import type { PlanContext } from './plan.js';
import type { PlanRecord, PlanStore } from './plan-store.js';

/** Planning was requested but no model is configured (no API key). */
export class PlanningUnavailableError extends Error {
  constructor() {
    super('planner_unconfigured');
    this.name = 'PlanningUnavailableError';
  }
}

/** The request conflicts with the plan's current state (409). */
export class PlanConflictError extends Error {
  constructor(
    readonly code: 'plan_not_ready' | 'already_planned' | 'plan_stale' | 'draft_in_progress',
  ) {
    super(code);
    this.name = 'PlanConflictError';
  }
}

/** At most this many drafts start automatically when a plan is approved. */
const AUTO_DRAFT_LIMIT = 5;

export interface ObjectiveExtras {
  readonly plan: PlanRecord | null;
  readonly progress: ObjectiveProgress | null;
}

export interface PlanServiceDeps {
  readonly work: WorkService;
  readonly objectives: ObjectiveService;
  readonly plans: PlanStore;
  readonly background: Background;
  /** Absent when no model is configured: planning and drafting are unavailable. */
  readonly model?: DonnaModel;
}

function failureCode(error: unknown): string {
  if (error instanceof DonnaModelError) return error.code;
  return 'unavailable';
}

/**
 * Donna's planning loop: outcome → drafted plan → human approval →
 * clients/projects/sprints/tasks → Donna drafts the tasks she owns.
 * Authorization is the route's job; this service enforces state rules.
 */
export class PlanService {
  /** Objectives whose approval is in flight — a double-tap must not build twice. */
  private readonly approving = new Set<string>();

  constructor(private readonly deps: PlanServiceDeps) {}

  get available(): boolean {
    return this.deps.model !== undefined;
  }

  private requireModel(): DonnaModel {
    if (this.deps.model === undefined) throw new PlanningUnavailableError();
    return this.deps.model;
  }

  async extras(
    org: string,
    objectiveIds: readonly string[],
  ): Promise<Record<string, ObjectiveExtras>> {
    const [plans, progress] = await Promise.all([
      this.deps.plans.list(org, objectiveIds),
      this.deps.work.progressByObjective(org, objectiveIds),
    ]);
    const byObjective = new Map(plans.map((p) => [p.objectiveId, p]));
    return Object.fromEntries(
      objectiveIds.map((id) => [
        id,
        { plan: byObjective.get(id) ?? null, progress: progress[id] ?? null },
      ]),
    );
  }

  get(org: string, objectiveId: string): Promise<PlanRecord | null> {
    return this.deps.plans.get(org, objectiveId);
  }

  private async context(org: string, objective: Objective, today: string): Promise<PlanContext> {
    const [clients, projects] = await Promise.all([
      this.deps.work.listClients(org),
      this.deps.work.listProjects(org),
    ]);
    return {
      outcome: objective.requestedOutcome,
      today,
      clients: clients
        .filter((c) => c.status !== 'archived')
        .slice(0, 200)
        .map((c) => ({
          id: c.id,
          name: c.name,
          projects: projects
            .filter((p) => p.clientId === c.id)
            .slice(0, 50)
            .map((p) => ({ id: p.id, name: p.name })),
        })),
      internalProjects: projects
        .filter((p) => p.clientId === null)
        .slice(0, 50)
        .map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /**
   * Start drafting a plan. Idempotent while one is drafting or proposed; a
   * failed or dismissed plan is redrafted. An approved plan is final.
   */
  async start(
    org: string,
    objective: Objective,
    today: string,
    retry = false,
  ): Promise<PlanRecord> {
    const model = this.requireModel();
    const existing = await this.deps.plans.get(org, objective.id);
    if (existing?.status === 'approved') throw new PlanConflictError('already_planned');
    if (
      existing !== null &&
      !retry &&
      (existing.status === 'drafting' || existing.status === 'proposed')
    ) {
      return existing;
    }
    const record = await this.deps.plans.startDrafting(org, objective.id);
    this.deps.background.run(async () => {
      try {
        const context = await this.context(org, objective, today);
        const { plan, model: modelId, costUsd } = await model.plan(context);
        await this.deps.plans.transition(org, objective.id, {
          status: 'proposed',
          plan,
          model: modelId,
          costUsd,
        });
      } catch (error) {
        await this.deps.plans.transition(org, objective.id, {
          status: 'failed',
          error: failureCode(error),
        });
        if (!(error instanceof DonnaModelError)) throw error;
      }
    });
    return record;
  }

  async dismiss(org: string, objectiveId: string): Promise<PlanRecord> {
    const plan = await this.deps.plans.get(org, objectiveId);
    if (plan === null || plan.status === 'approved') throw new PlanConflictError('plan_not_ready');
    return (await this.deps.plans.transition(org, objectiveId, { status: 'dismissed' }))!;
  }

  /**
   * Turn a proposed plan into real records. `taskIndexes` selects which of the
   * plan's tasks to keep (default: all). Existing clients/projects the plan
   * references must still exist, or the approval is refused as stale.
   */
  async approve(
    org: string,
    objective: Objective,
    approvedBy: string,
    taskIndexes?: readonly number[],
  ): Promise<{ plan: PlanRecord; projectId: string }> {
    if (this.approving.has(objective.id)) throw new PlanConflictError('plan_not_ready');
    this.approving.add(objective.id);
    try {
      return await this.materialize(org, objective, approvedBy, taskIndexes);
    } finally {
      this.approving.delete(objective.id);
    }
  }

  private async materialize(
    org: string,
    objective: Objective,
    approvedBy: string,
    taskIndexes?: readonly number[],
  ): Promise<{ plan: PlanRecord; projectId: string }> {
    const record = await this.deps.plans.get(org, objective.id);
    if (record === null || record.status !== 'proposed' || record.plan === null) {
      throw new PlanConflictError(
        record?.status === 'approved' ? 'already_planned' : 'plan_not_ready',
      );
    }
    const plan = record.plan;
    const keep =
      taskIndexes === undefined
        ? plan.tasks
        : plan.tasks.filter((_t, i) => taskIndexes.includes(i));
    if (keep.length === 0) throw new WorkValidationError('no_tasks_selected');
    const { work } = this.deps;

    let clientId: string | null = null;
    if (plan.client.kind === 'existing') {
      if ((await work.getClient(org, plan.client.id)) === null)
        throw new PlanConflictError('plan_stale');
      clientId = plan.client.id;
    } else if (plan.client.kind === 'new') {
      clientId = (await work.createClient(org, { name: plan.client.name })).id;
    }

    let projectId: string;
    if (plan.project.kind === 'existing') {
      if ((await work.getProject(org, plan.project.id)) === null)
        throw new PlanConflictError('plan_stale');
      projectId = plan.project.id;
    } else {
      projectId = (await work.createProject(org, { name: plan.project.name, clientId })).id;
    }

    let sprintId: string | null = null;
    if (plan.sprint !== null) {
      const { name, startsOn, endsOn } = plan.sprint;
      sprintId = (
        await work.createSprint(org, {
          projectId,
          name,
          ...(startsOn !== null ? { startsOn } : {}),
          ...(endsOn !== null ? { endsOn } : {}),
        })
      ).id;
    }

    const donnaTasks: WorkItemView[] = [];
    for (const t of keep) {
      const task = await work.createWorkItem(
        org,
        { projectId, title: t.title, sprintId, objectiveId: objective.id, owner: t.owner },
        approvedBy,
      );
      for (const sub of t.subtasks) {
        await work.createWorkItem(
          org,
          { projectId, title: sub, parentId: task.id, objectiveId: objective.id, owner: t.owner },
          approvedBy,
        );
      }
      if (t.owner === 'donna') donnaTasks.push(task);
    }

    await this.deps.objectives.activate(objective.id, org, projectId);
    const approved = await this.deps.plans.transition(org, objective.id, {
      status: 'approved',
      projectId,
      approvedBy,
    });

    // Donna gets started on her own tasks straight away, one at a time.
    const queue = donnaTasks.slice(0, AUTO_DRAFT_LIMIT);
    if (this.deps.model !== undefined && queue.length > 0) {
      for (const t of queue) await work.setDraft(org, t.id, { status: 'drafting' });
      this.deps.background.run(async () => {
        for (const t of queue) await this.writeDraft(org, t.id);
      });
    }

    return { plan: approved!, projectId };
  }

  /** Ask Donna to draft a task (any task — not only ones she planned for herself). */
  async startDraft(org: string, taskId: string): Promise<WorkItemView | null> {
    this.requireModel();
    const task = await this.deps.work.getWorkItem(org, taskId);
    if (task === null) return null;
    if (task.draftStatus === 'drafting') throw new PlanConflictError('draft_in_progress');
    const marked = await this.deps.work.setDraft(org, taskId, { status: 'drafting' });
    this.deps.background.run(() => this.writeDraft(org, taskId));
    return marked;
  }

  private async writeDraft(org: string, taskId: string): Promise<void> {
    const model = this.requireModel();
    const { work } = this.deps;
    try {
      const task = await work.getWorkItem(org, taskId);
      if (task === null) return;
      const [project, siblings, objective] = await Promise.all([
        work.getProject(org, task.projectId),
        work.listWorkItems(org, { projectId: task.projectId }),
        task.objectiveId !== null ? this.deps.objectives.get(task.objectiveId, org) : null,
      ]);
      const client = project?.clientId != null ? await work.getClient(org, project.clientId) : null;
      const { markdown } = await model.draft({
        task: task.title,
        subtasks: siblings.filter((s) => s.parentId === task.id).map((s) => s.title),
        project: project?.name ?? 'Project',
        client: client?.name ?? null,
        objective: objective?.requestedOutcome ?? null,
      });
      await work.setDraft(org, taskId, { status: 'ready', draft: markdown });
    } catch (error) {
      await work.setDraft(org, taskId, { status: 'failed', error: failureCode(error) });
      if (!(error instanceof DonnaModelError)) throw error;
    }
  }
}
