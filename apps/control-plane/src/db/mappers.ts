import type {
  AuthorityLevel,
  ExecutionClass,
  Objective,
  ObjectiveId,
  ObjectiveStatus,
  OrganizationId,
  ProjectId,
  RiskLevel,
  Scope,
  Task,
  TaskId,
  TaskStatus,
  UserId,
} from '@donna/core-domain';
import { schema } from '@donna/db';
import type { WorkOrder } from '@donna/orchestrator';

type ObjectiveRow = typeof schema.objectives.$inferSelect;
type ObjectiveInsert = typeof schema.objectives.$inferInsert;
type TaskRow = typeof schema.tasks.$inferSelect;
type TaskInsert = typeof schema.tasks.$inferInsert;

/**
 * Map a domain {@link Objective} to an `objectives` insert row. The
 * organization id is a tenancy column not carried on the domain object, so it is
 * supplied by the service from the request principal.
 */
export function objectiveToRow(objective: Objective, organizationId: string): ObjectiveInsert {
  return {
    id: objective.id,
    organizationId,
    scope: objective.scope,
    requesterId: objective.requesterId,
    ownerId: objective.ownerId,
    requestedOutcome: objective.requestedOutcome,
    definitionOfDone: objective.definitionOfDone,
    status: objective.status,
    riskLevel: objective.riskLevel,
    ...(objective.projectId !== undefined ? { projectId: objective.projectId } : {}),
    ...(objective.dueAt !== undefined ? { dueAt: objective.dueAt } : {}),
    ...(objective.completionSummary !== undefined
      ? { completionSummary: objective.completionSummary }
      : {}),
  };
}

/** Map an `objectives` row back to the domain {@link Objective}. */
export function rowToObjective(row: ObjectiveRow): Objective {
  return {
    id: row.id as ObjectiveId,
    scope: row.scope as Scope,
    requesterId: row.requesterId as UserId,
    ownerId: row.ownerId as UserId,
    requestedOutcome: row.requestedOutcome,
    definitionOfDone: row.definitionOfDone,
    status: row.status as ObjectiveStatus,
    riskLevel: row.riskLevel as RiskLevel,
    ...(row.projectId !== null ? { projectId: row.projectId as ProjectId } : {}),
    ...(row.dueAt !== null ? { dueAt: row.dueAt } : {}),
    ...(row.completionSummary !== null ? { completionSummary: row.completionSummary } : {}),
  };
}

/**
 * Map a domain {@link Task} to a `tasks` insert row. `requiredCapabilities` is a
 * persisted column not carried on the minimal domain Task, so it is supplied
 * alongside (from the dispatch request); `organizationId` is the tenancy column.
 */
export function taskToRow(
  task: Task,
  organizationId: string,
  requiredCapabilities: readonly string[],
): TaskInsert {
  return {
    id: task.id,
    organizationId,
    objectiveId: task.objectiveId,
    goal: task.goal,
    definitionOfDone: task.definitionOfDone,
    status: task.status,
    requiredAuthority: task.requiredAuthority,
    requiredCapabilities: [...requiredCapabilities],
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    ...(task.executionClass !== undefined ? { executionClass: task.executionClass } : {}),
    ...(task.idempotencyKey !== undefined ? { idempotencyKey: task.idempotencyKey } : {}),
  };
}

/** Map a `tasks` row back to the domain {@link Task}. */
export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    objectiveId: row.objectiveId as ObjectiveId,
    goal: row.goal,
    definitionOfDone: row.definitionOfDone,
    status: row.status as TaskStatus,
    requiredAuthority: row.requiredAuthority as AuthorityLevel,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    ...(row.executionClass !== null
      ? { executionClass: row.executionClass as ExecutionClass }
      : {}),
    ...(row.parentTaskId !== null ? { parentTaskId: row.parentTaskId as TaskId } : {}),
  };
}

/** Routing hints carried on a dispatch request, used to build the work order. */
export interface WorkOrderHints {
  readonly requiredCapabilities: readonly string[];
  readonly prefersHuman?: boolean;
  readonly needsReasoning?: boolean;
  readonly reasoningTier?: number;
  readonly needsTools?: boolean;
  readonly needsVision?: boolean;
  readonly requireLocal?: boolean;
  readonly minContextTokens?: number;
  readonly modelRequest?: WorkOrder['modelRequest'];
}

/**
 * Build the {@link WorkOrder} enqueued for a created task. Pure: the task id ties
 * the order to its durable row, and the routing hints steer the orchestrator's
 * Work Router / Model Router. Optional fields are omitted (never `undefined`) so
 * the payload stays clean under `exactOptionalPropertyTypes`.
 */
export function buildWorkOrder(
  task: Task,
  organizationId: string,
  hints: WorkOrderHints,
): WorkOrder {
  return {
    organizationId: organizationId as OrganizationId,
    taskId: task.id,
    requiredCapabilities: hints.requiredCapabilities,
    ...(hints.prefersHuman !== undefined ? { prefersHuman: hints.prefersHuman } : {}),
    ...(hints.needsReasoning !== undefined ? { needsReasoning: hints.needsReasoning } : {}),
    ...(hints.reasoningTier !== undefined ? { reasoningTier: hints.reasoningTier } : {}),
    ...(hints.needsTools !== undefined ? { needsTools: hints.needsTools } : {}),
    ...(hints.needsVision !== undefined ? { needsVision: hints.needsVision } : {}),
    ...(hints.requireLocal !== undefined ? { requireLocal: hints.requireLocal } : {}),
    ...(hints.minContextTokens !== undefined ? { minContextTokens: hints.minContextTokens } : {}),
    ...(hints.modelRequest !== undefined ? { modelRequest: hints.modelRequest } : {}),
  };
}
