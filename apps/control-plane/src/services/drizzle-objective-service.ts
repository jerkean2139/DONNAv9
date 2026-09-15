import { randomUUID } from 'node:crypto';

import type { Objective, ObjectiveId, OrganizationId, UserId } from '@donna/core-domain';
import { eventEnvelopeToRow, schema, type DonnaDatabase } from '@donna/db';
import { createEvent } from '@donna/events';
import type { PrincipalContext } from '@donna/policy';
import { eq } from 'drizzle-orm';

import { objectiveToRow, rowToObjective } from '../db/mappers.js';
import type { CreateObjectiveInput, ObjectiveService } from './objective-service.js';

/**
 * Postgres-backed {@link ObjectiveService} (Technical Plan §3.3/§4.2). `create`
 * persists the objective row and writes `objective.created` to the event outbox
 * (`dispatched_at = null`) in ONE transaction — no objective without its event,
 * no phantom event. The route contract and emitted event match the in-memory
 * service exactly.
 */
export class DrizzleObjectiveService implements ObjectiveService {
  constructor(private readonly db: DonnaDatabase) {}

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
    const event = createEvent({
      type: 'objective.created',
      organizationId: principal.organizationId as OrganizationId,
      actor: {
        type: principal.actorKind === 'human' ? 'human' : 'orchestrator',
        id: principal.userId,
      },
      objectiveId: id,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.objectives)
        .values(objectiveToRow(objective, principal.organizationId));
      await tx.insert(schema.events).values(eventEnvelopeToRow(event));
    });

    return objective;
  }

  async get(id: string): Promise<Objective | null> {
    const rows = await this.db
      .select()
      .from(schema.objectives)
      .where(eq(schema.objectives.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : rowToObjective(row);
  }
}
