import { randomUUID } from 'node:crypto';

import type {
  EventEnvelope,
  Objective,
  ObjectiveId,
  OrganizationId,
  UserId,
} from '@donna/core-domain';
import { eventEnvelopeToRow, schema, type DonnaDatabase } from '@donna/db';
import { createEvent } from '@donna/events';
import type { PrincipalContext } from '@donna/policy';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';

import { objectiveToRow, rowToEvent, rowToObjective } from '../db/mappers.js';
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
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
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

  async get(id: string, organizationId: string): Promise<Objective | null> {
    const rows = await this.db
      .select()
      .from(schema.objectives)
      .where(
        and(eq(schema.objectives.id, id), eq(schema.objectives.organizationId, organizationId)),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : rowToObjective(row);
  }

  async list(organizationId: string, limit: number): Promise<Objective[]> {
    const rows = await this.db
      .select()
      .from(schema.objectives)
      .where(eq(schema.objectives.organizationId, organizationId))
      .orderBy(desc(schema.objectives.createdAt))
      .limit(limit);
    return rows.map(rowToObjective);
  }

  async activate(id: string, organizationId: string, projectId: string): Promise<Objective | null> {
    const [row] = await this.db
      .update(schema.objectives)
      .set({ status: 'active', projectId, updatedAt: new Date() })
      .where(
        and(eq(schema.objectives.id, id), eq(schema.objectives.organizationId, organizationId)),
      )
      .returning();
    return row === undefined ? null : rowToObjective(row);
  }

  async events(
    objectiveId: string,
    organizationId: string,
    limit: number,
  ): Promise<EventEnvelope[]> {
    // The worker records task events by task id alone (no objective id), so
    // match the objective's own events and those of every task under it.
    const objectiveTasks = this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.objectiveId, objectiveId),
          eq(schema.tasks.organizationId, organizationId),
        ),
      );
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(
        and(
          eq(schema.events.organizationId, organizationId),
          or(
            eq(schema.events.objectiveId, objectiveId),
            inArray(schema.events.taskId, objectiveTasks),
          ),
        ),
      )
      .orderBy(asc(schema.events.createdAt))
      .limit(limit);
    return rows.map(rowToEvent);
  }
}
