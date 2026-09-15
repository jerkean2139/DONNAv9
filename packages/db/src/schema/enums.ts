import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Postgres enums for the control plane.
 *
 * These mirror the string unions in `@donna/core-domain`. The mirror is
 * enforced by `schema.test.ts` (a drift guard) rather than by importing the
 * const arrays directly, which keeps the generated SQL stable and readable.
 */

// Access scopes (Build Bible V2-004). Every scoped row also carries organization_id.
export const scopeEnum = pgEnum('scope', ['PRIVATE', 'PROJECT', 'TEAM', 'ORGANIZATION']);

// Initial roles (Technical Plan §6.3). Refined by resource/action permissions.
export const roleEnum = pgEnum('role', [
  'owner',
  'admin',
  'executive',
  'team_lead',
  'team_member',
  'contractor',
]);

export const objectiveStatusEnum = pgEnum('objective_status', [
  'draft',
  'active',
  'blocked',
  'completed',
  'cancelled',
]);

export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high', 'critical']);

// Durable Task lifecycle (Technical Plan §3.3/§5).
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'planned',
  'assigned',
  'running',
  'blocked',
  'awaiting_approval',
  'checking',
  'completed',
  'failed',
  'cancelled',
]);

// Work Router execution classes (Build Bible V2-006).
export const executionClassEnum = pgEnum('execution_class', [
  'deterministic',
  'automation',
  'human',
  'browser',
  'coding_agent',
  'local_ai',
  'cloud_ai',
]);

// Canonical event types (Technical Plan §4.2).
export const eventTypeEnum = pgEnum('event_type', [
  'objective.created',
  'task.created',
  'task.planned',
  'task.assigned',
  'worker.started',
  'tool.called',
  'artifact.created',
  'approval.requested',
  'approval.decided',
  'task.blocked',
  'task.retried',
  'task.completed',
  'task.failed',
  'memory.updated',
  'node.health_changed',
  'system.alert',
]);

export const actorTypeEnum = pgEnum('actor_type', ['human', 'orchestrator', 'adapter', 'checker']);

export const approvalDecisionEnum = pgEnum('approval_decision', [
  'pending',
  'approved',
  'rejected',
  'expired',
]);

export const delegationStatusEnum = pgEnum('delegation_status', [
  'proposed',
  'accepted',
  'in_progress',
  'completed',
  'escalated',
  'cancelled',
]);

// Source confidence (Build Bible V2-022) — a DB fact is never an AI inference.
export const sourceConfidenceEnum = pgEnum('source_confidence', [
  'AUTHORITATIVE',
  'PRIMARY',
  'DERIVED',
  'INFERRED',
  'UNVERIFIED',
]);
