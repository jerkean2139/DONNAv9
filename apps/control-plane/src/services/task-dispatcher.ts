import { randomUUID } from 'node:crypto';

import type { AuthorityLevel, ObjectiveId, OrganizationId, Task, TaskId } from '@donna/core-domain';
import { AUTHORITY_LEVELS } from '@donna/core-domain';
import { eventEnvelopeToRow, schema, type DonnaDatabase } from '@donna/db';
import { createEvent } from '@donna/events';
import { EXECUTE_WORK_ORDER_TASK } from '@donna/orchestrator';
import type { PrincipalContext } from '@donna/policy';
import { sql } from 'drizzle-orm';

import { buildWorkOrder, taskToRow, type WorkOrderHints } from '../db/mappers.js';
import type { TaskService } from './task-service.js';
import type { WorkQueue } from './work-queue.js';

/** Everything needed to create a task and enqueue its work order. */
export interface DispatchInput extends WorkOrderHints {
  readonly objectiveId: ObjectiveId;
  readonly goal: string;
  readonly definitionOfDone: string;
  readonly requiredAuthority?: AuthorityLevel;
}

export interface DispatchResult {
  readonly task: Task;
  readonly jobId: string;
}

/**
 * Creates a durable task and enqueues its work order. The point of this seam is
 * atomicity: the {@link DrizzleTaskDispatcher} does both — plus the
 * `task.created` event — in ONE database transaction, so a task never exists
 * without its job and no job is enqueued for a task that failed to persist.
 */
export interface TaskDispatcher {
  dispatch(input: DispatchInput, principal: PrincipalContext): Promise<DispatchResult>;
}

function newTask(input: DispatchInput): Task {
  return {
    id: randomUUID() as TaskId,
    objectiveId: input.objectiveId,
    goal: input.goal,
    definitionOfDone: input.definitionOfDone,
    status: 'pending',
    requiredAuthority: input.requiredAuthority ?? AUTHORITY_LEVELS.PREPARE,
    retryCount: 0,
    maxRetries: 3,
  };
}

/**
 * In-memory dispatcher for the skeleton and tests: composes the in-memory task
 * service (which emits `task.created`) and work queue. Not atomic — the durable
 * guarantee is the {@link DrizzleTaskDispatcher}'s job.
 */
export class InMemoryTaskDispatcher implements TaskDispatcher {
  constructor(
    private readonly tasks: TaskService,
    private readonly queue: WorkQueue,
  ) {}

  async dispatch(input: DispatchInput, principal: PrincipalContext): Promise<DispatchResult> {
    const task = await this.tasks.create(
      {
        objectiveId: input.objectiveId,
        goal: input.goal,
        definitionOfDone: input.definitionOfDone,
        ...(input.requiredAuthority !== undefined
          ? { requiredAuthority: input.requiredAuthority }
          : {}),
      },
      principal,
    );
    const order = buildWorkOrder(task, principal.organizationId, input);
    const { jobId } = await this.queue.enqueue(order);
    return { task, jobId };
  }
}

/**
 * Postgres-backed dispatcher (Technical Plan §4.2/§5). In one transaction it
 * inserts the task row, writes `task.created` to the event outbox
 * (`dispatched_at = null`), and enqueues the `execute-work-order` job via
 * graphile-worker's `add_job` — which participates in the caller's transaction.
 * Either everything commits or nothing does. The task id is the job key, so a
 * retried dispatch replaces the pending job rather than duplicating it.
 */
export class DrizzleTaskDispatcher implements TaskDispatcher {
  constructor(private readonly db: DonnaDatabase) {}

  async dispatch(input: DispatchInput, principal: PrincipalContext): Promise<DispatchResult> {
    const task = newTask(input);
    const organizationId = principal.organizationId as OrganizationId;
    const order = buildWorkOrder(task, principal.organizationId, input);
    const event = createEvent({
      type: 'task.created',
      organizationId,
      actor: {
        type: principal.actorKind === 'human' ? 'human' : 'orchestrator',
        id: principal.userId,
      },
      objectiveId: input.objectiveId,
      taskId: task.id,
    });

    let jobId = '';
    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.tasks)
        .values(taskToRow(task, principal.organizationId, input.requiredCapabilities));
      await tx.insert(schema.events).values(eventEnvelopeToRow(event));
      const result = (await tx.execute(
        sql`select id from graphile_worker.add_job(${EXECUTE_WORK_ORDER_TASK}, payload => ${JSON.stringify(order)}::json, job_key => ${task.id})`,
      )) as unknown as Array<{ id: string | number }>;
      const row = result[0];
      jobId = row !== undefined ? String(row.id) : '';
    });

    return { task, jobId };
  }
}
