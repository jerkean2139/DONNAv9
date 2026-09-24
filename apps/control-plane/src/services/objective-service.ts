import { randomUUID } from 'node:crypto';

import type {
  Objective,
  ObjectiveId,
  OrganizationId,
  ProjectId,
  RiskLevel,
  Scope,
  UserId,
} from '@donna/core-domain';
import { createEvent, type EventBus } from '@donna/events';
import type { PrincipalContext } from '@donna/policy';

export interface CreateObjectiveInput {
  readonly requestedOutcome: string;
  readonly definitionOfDone: string;
  readonly scope: Scope;
  readonly riskLevel: RiskLevel;
  readonly projectId?: ProjectId;
  /** Owning team for a TEAM-scoped objective (persisted as `scope_ref`). */
  readonly teamId?: string;
}

export interface ObjectiveService {
  create(input: CreateObjectiveInput, principal: PrincipalContext): Promise<Objective>;
  /**
   * Fetch an objective by id, scoped to `organizationId`. Reads are
   * tenant-isolated: an objective owned by another organization reads as `null`,
   * never leaks across the tenant boundary (Build Bible: multi-tenant from the
   * schema up).
   */
  get(id: string, organizationId: string): Promise<Objective | null>;
  /**
   * The organization's most recent objectives, newest first. Tenant-scoped like
   * `get`; the caller still applies the per-objective scope policy.
   */
  list(organizationId: string, limit: number): Promise<Objective[]>;
}

/**
 * In-memory objective service for the skeleton and tests. The Drizzle-backed
 * implementation (persisting objectives and enqueuing `objective.created` in the
 * transactional outbox within one transaction) lands with the DB wiring; the
 * route contract and event emission are identical.
 */
export class InMemoryObjectiveService implements ObjectiveService {
  // The domain Objective carries no org id, so track tenancy alongside it to
  // enforce scoped reads the same way the Drizzle query does.
  private readonly store = new Map<string, { objective: Objective; organizationId: string }>();

  constructor(private readonly bus: EventBus) {}

  async create(input: CreateObjectiveInput, principal: PrincipalContext): Promise<Objective> {
    const id = randomUUID() as ObjectiveId;
    const userId = principal.userId as UserId;
    const objective: Objective = {
      id,
      scope: input.scope,
      requesterId: userId,
      ownerId: userId,
      requestedOutcome: input.requestedOutcome,
      definitionOfDone: input.definitionOfDone,
      status: 'draft',
      riskLevel: input.riskLevel,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    };
    this.store.set(id, { objective, organizationId: principal.organizationId });

    await this.bus.publish(
      createEvent({
        type: 'objective.created',
        organizationId: principal.organizationId as OrganizationId,
        actor: {
          type: principal.actorKind === 'human' ? 'human' : 'orchestrator',
          id: principal.userId,
        },
        objectiveId: id,
      }),
    );

    return objective;
  }

  async get(id: string, organizationId: string): Promise<Objective | null> {
    const entry = this.store.get(id);
    if (entry === undefined || entry.organizationId !== organizationId) return null;
    return entry.objective;
  }

  async list(organizationId: string, limit: number): Promise<Objective[]> {
    // Map preserves insertion order, so reverse it for newest first.
    return [...this.store.values()]
      .filter((entry) => entry.organizationId === organizationId)
      .map((entry) => entry.objective)
      .reverse()
      .slice(0, limit);
  }
}
