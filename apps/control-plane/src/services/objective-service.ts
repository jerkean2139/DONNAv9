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
}
