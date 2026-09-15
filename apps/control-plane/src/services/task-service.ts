import { randomUUID } from 'node:crypto';

import type { AuthorityLevel, ObjectiveId, OrganizationId, Task, TaskId } from '@donna/core-domain';
import { AUTHORITY_LEVELS } from '@donna/core-domain';
import { createEvent, type EventBus } from '@donna/events';
import type { PrincipalContext } from '@donna/policy';

export interface CreateTaskInput {
  readonly objectiveId: ObjectiveId;
  readonly goal: string;
  readonly definitionOfDone: string;
  readonly requiredAuthority?: AuthorityLevel;
}

export interface TaskService {
  create(input: CreateTaskInput, principal: PrincipalContext): Promise<Task>;
  get(id: string): Promise<Task | null>;
}

/**
 * In-memory task service for the skeleton and tests. The Drizzle-backed
 * implementation persists the task and enqueues the work order in ONE
 * transaction (the job outbox), so a task is never created without its job and
 * no job is enqueued for a task that failed to persist; that lands with the DB
 * wiring. The route contract and `task.created` emission are identical.
 */
export class InMemoryTaskService implements TaskService {
  private readonly store = new Map<string, Task>();

  constructor(private readonly bus: EventBus) {}

  async create(input: CreateTaskInput, principal: PrincipalContext): Promise<Task> {
    const id = randomUUID() as TaskId;
    const task: Task = {
      id,
      objectiveId: input.objectiveId,
      goal: input.goal,
      definitionOfDone: input.definitionOfDone,
      status: 'pending',
      requiredAuthority: input.requiredAuthority ?? AUTHORITY_LEVELS.PREPARE,
      retryCount: 0,
      maxRetries: 3,
    };
    this.store.set(id, task);

    await this.bus.publish(
      createEvent({
        type: 'task.created',
        organizationId: principal.organizationId as OrganizationId,
        actor: {
          type: principal.actorKind === 'human' ? 'human' : 'orchestrator',
          id: principal.userId,
        },
        objectiveId: input.objectiveId,
        taskId: id,
      }),
    );

    return task;
  }

  async get(id: string): Promise<Task | null> {
    return this.store.get(id) ?? null;
  }
}
