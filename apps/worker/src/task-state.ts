import {
  canTransition,
  IllegalTaskTransitionError,
  isTerminalTaskStatus,
  type Actor,
  type EventEnvelope,
  type ObjectiveId,
  type OrganizationId,
  type TaskId,
  type TaskStatus,
} from '@donna/core-domain';
import { eventEnvelopeToRow, schema, type DonnaDatabase } from '@donna/db';
import { createEvent, type EventBus, type Unsubscribe } from '@donna/events';
import { EXECUTE_WORK_ORDER_TASK, type WorkOrder, type WorkOrderStatus } from '@donna/orchestrator';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Write-only {@link EventBus} that collects published events in memory instead
 * of persisting them (SEC-4). The worker hands one per job to the orchestrator,
 * then commits the whole execution trace together with the authoritative
 * task-row transition in a SINGLE transaction (see {@link TaskStateStore}). A
 * fresh instance per job keeps concurrent executions from mixing their traces.
 */
export class BufferingEventBus implements EventBus {
  private readonly events: EventEnvelope[] = [];

  publish(event: EventEnvelope): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  // The buffer is write-only; consumers subscribe to the delivered bus.
  subscribe(): Unsubscribe {
    throw new Error('BufferingEventBus is write-only; subscribe to the delivered bus instead.');
  }

  /** Return the buffered events and empty the buffer. */
  drain(): EventEnvelope[] {
    return this.events.splice(0);
  }
}

/** The task status an orchestrator outcome resolves to (before retry accounting). */
type TargetStatus = 'completed' | 'failed' | 'awaiting_approval' | 'blocked';

/**
 * The legal single-step path the durable task row walks from `pending` to each
 * outcome (Technical Plan §3.3/§5 state machine). Only the final status is
 * persisted; the intermediate steps are validated against the domain machine so
 * an illegal path can never be committed. `blocked` outcomes (policy denial, no
 * adapter, budget, human execution) never reach `running`.
 */
const PATH_TO_TARGET: Readonly<Record<TargetStatus, readonly TaskStatus[]>> = {
  completed: ['planned', 'assigned', 'running', 'completed'],
  failed: ['planned', 'assigned', 'running', 'failed'],
  awaiting_approval: ['planned', 'assigned', 'running', 'awaiting_approval'],
  blocked: ['planned', 'blocked'],
};

/**
 * Map an orchestrator {@link WorkOrderStatus} to the durable task status it
 * resolves to. `denied`/`blocked`/`budget_exceeded`/`awaiting_human` all park
 * the task as `blocked` (a human can unblock and reassign); `approval_required`
 * parks it as `awaiting_approval`; `failed` is terminal unless retry budget
 * remains (handled by {@link TaskStateStore.commitOutcome}).
 */
export function targetStatusForResult(status: WorkOrderStatus): TargetStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'approval_required':
      return 'awaiting_approval';
    case 'denied':
    case 'blocked':
    case 'budget_exceeded':
    case 'awaiting_human':
      return 'blocked';
  }
}

export interface CommitOutcomeInput {
  readonly taskId: string;
  readonly organizationId: string;
  readonly result: { readonly status: WorkOrderStatus; readonly reason?: string };
  /** The execution-trace events buffered from the orchestrator during this run. */
  readonly events: readonly EventEnvelope[];
  /** The original work order, re-enqueued verbatim when a retryable failure has budget left. */
  readonly order: WorkOrder;
  /** Who to attribute the synthesized `task.retried` event to. */
  readonly actor?: Actor;
}

export type CommitOutcome =
  | { readonly applied: true; readonly status: TaskStatus; readonly retried: boolean }
  | { readonly applied: false; readonly reason: 'not_found' | 'already_terminal' | 'not_pending' };

/**
 * Persists the authoritative durable task-row transition after a work order runs
 * (SEC-4). The orchestrator emits the execution trace but never touches the task
 * row, so before this the row stayed `pending` forever.
 *
 * {@link commitOutcome} does everything in ONE transaction: it locks the task
 * row, writes the buffered trace events, walks the domain state machine to the
 * outcome status, and updates the row — so the task row and its events can never
 * disagree once committed. It is redelivery-safe (a task already terminal is
 * skipped, never transitioned illegally or double-written). A retryable failure
 * with budget left increments `retryCount`, emits `task.retried`, and re-enqueues
 * the same order (keyed by task id, so it replaces rather than duplicates).
 */
export class TaskStateStore {
  constructor(private readonly db: DonnaDatabase) {}

  async commitOutcome(input: CommitOutcomeInput): Promise<CommitOutcome> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          status: schema.tasks.status,
          retryCount: schema.tasks.retryCount,
          maxRetries: schema.tasks.maxRetries,
          objectiveId: schema.tasks.objectiveId,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.id, input.taskId),
            eq(schema.tasks.organizationId, input.organizationId),
          ),
        )
        .for('update')
        .limit(1);
      const row = rows[0];
      if (row === undefined) return { applied: false, reason: 'not_found' };

      const current = row.status as TaskStatus;
      // Redelivery of an already-finished job: never re-transition or re-write.
      if (isTerminalTaskStatus(current)) return { applied: false, reason: 'already_terminal' };
      // A fresh run always finds the row `pending` (buffering means `running` is
      // never persisted; only a retry re-enqueues, and it returns to `pending`).
      // Anything else is unexpected — skip rather than risk a poison job.
      if (current !== 'pending') return { applied: false, reason: 'not_pending' };

      // Persist the execution trace (the orchestrator's buffered events) in the
      // same transaction as the row transition.
      if (input.events.length > 0) {
        await tx.insert(schema.events).values(input.events.map(eventEnvelopeToRow));
      }

      // Walk the state machine to the outcome, validating every step.
      const target = targetStatusForResult(input.result.status);
      let status: TaskStatus = current;
      for (const next of PATH_TO_TARGET[target]) {
        if (!canTransition(status, next)) throw new IllegalTaskTransitionError(status, next);
        status = next;
      }

      // A retryable failure with budget left re-enters the queue as `pending`.
      let retryCount = row.retryCount;
      let retried = false;
      if (target === 'failed' && retryCount < row.maxRetries) {
        if (!canTransition(status, 'pending'))
          throw new IllegalTaskTransitionError(status, 'pending');
        status = 'pending';
        retryCount += 1;
        retried = true;
      }

      await tx
        .update(schema.tasks)
        .set({ status, retryCount, updatedAt: new Date() })
        .where(
          and(
            eq(schema.tasks.id, input.taskId),
            eq(schema.tasks.organizationId, input.organizationId),
          ),
        );

      if (retried) {
        // The orchestrator does not emit `task.retried`; the component that owns
        // the durable row does, in the same transaction as the re-enqueue.
        const retryEvent = createEvent({
          type: 'task.retried',
          organizationId: input.organizationId as OrganizationId,
          actor: input.actor ?? { type: 'orchestrator', id: 'worker' },
          objectiveId: row.objectiveId as ObjectiveId,
          taskId: input.taskId as TaskId,
        });
        await tx.insert(schema.events).values(eventEnvelopeToRow(retryEvent));
        // Re-enqueue the identical order. job_key = task id, so a retry replaces
        // the job rather than duplicating it (matches the dispatcher's contract).
        await tx.execute(
          sql`select id from graphile_worker.add_job(${EXECUTE_WORK_ORDER_TASK}, payload => ${JSON.stringify(
            input.order,
          )}::json, job_key => ${input.taskId})`,
        );
      }

      return { applied: true, status, retried };
    });
  }
}
