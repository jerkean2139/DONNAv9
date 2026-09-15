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
  get(id: string): Promise<Objective | null>;
}

/**
 * In-memory objective service for the skeleton and tests. The Drizzle-backed
 * implementation (persisting objectives and enqueuing `objective.created` in the
 * transactional outbox within one transaction) lands with the DB wiring; the
 * route contract and event emission are identical.
 */
export class InMemoryObjectiveService implements ObjectiveService {
  private readonly store = new Map<string, Objective>();

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
    this.store.set(id, objective);

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

  async get(id: string): Promise<Objective | null> {
    return this.store.get(id) ?? null;
  }
}
