import type { ObjectiveId, ProjectId, UserId } from './ids.js';
import type { Scope } from './scope.js';

/**
 * Objective status. Donna owns Objectives; workers execute bounded Tasks
 * beneath them (Technical Plan §4, Build Bible doc 04).
 */
export const OBJECTIVE_STATUSES = ['draft', 'active', 'blocked', 'completed', 'cancelled'] as const;

export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Minimal Objective shape (Technical Plan §3.3). Represents a requested
 * outcome with an explicit definition of done — the durable unit Donna owns.
 */
export interface Objective {
  readonly id: ObjectiveId;
  readonly scope: Scope;
  readonly requesterId: UserId;
  readonly ownerId: UserId;
  readonly requestedOutcome: string;
  readonly definitionOfDone: string;
  readonly status: ObjectiveStatus;
  readonly riskLevel: RiskLevel;
  readonly projectId?: ProjectId;
  /**
   * The owning team for a TEAM-scoped objective (persisted as `scope_ref`).
   * Surfaced so scope authorization can check team membership at read time.
   */
  readonly teamId?: string;
  readonly dueAt?: Date;
  readonly completionSummary?: string;
}
