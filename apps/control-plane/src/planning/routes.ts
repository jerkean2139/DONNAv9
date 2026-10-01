import type { Objective } from '@donna/core-domain';
import { evaluate, type PrincipalContext, type ResourceDescriptor } from '@donna/policy';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { OBJECTIVE_READ_ACTION, WORK_READ_ACTION, WORK_WRITE_ACTION } from '../actions.js';
import type { Authenticator } from '../auth/authenticate.js';
import type { ObjectiveService } from '../services/objective-service.js';
import { WorkValidationError, type WorkService } from '../work/types.js';
import { PlanConflictError, PlanningUnavailableError, type PlanService } from './plan-service.js';

export interface PlanRouteDeps {
  readonly planning: PlanService;
  readonly objectives: ObjectiveService;
  readonly work: WorkService;
  readonly authenticate: Authenticator;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function objectiveResource(o: Objective, principal: PrincipalContext): ResourceDescriptor {
  return {
    organizationId: principal.organizationId,
    scope: o.scope,
    ownerUserId: o.ownerId,
    ...(o.projectId !== undefined ? { projectId: o.projectId } : {}),
    ...(o.teamId !== undefined ? { teamId: o.teamId } : {}),
  };
}

const orgResource = (org: string): ResourceDescriptor => ({
  organizationId: org,
  scope: 'ORGANIZATION',
});

/**
 * Donna's planning API. Reading a plan follows the objective's read policy;
 * drafting, approving and dismissing also need work.write (approving creates
 * clients, projects, sprints and tasks). Errors map to stable codes:
 * 503 planner_unconfigured, 409 for state conflicts, 400 for bad input.
 */
export function registerPlanRoutes(app: FastifyInstance, deps: PlanRouteDeps): void {
  const { planning } = deps;

  async function principalOf(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      await reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    return auth.principal;
  }

  /** The objective if the caller may read it; otherwise replies 404. */
  async function readableObjective(
    principal: PrincipalContext,
    id: string,
    reply: FastifyReply,
  ): Promise<Objective | null> {
    const objective = await deps.objectives.get(id, principal.organizationId);
    if (
      objective === null ||
      evaluate({
        principal,
        action: OBJECTIVE_READ_ACTION,
        resource: objectiveResource(objective, principal),
      }).effect !== 'allow'
    ) {
      await reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return objective;
  }

  function canWrite(principal: PrincipalContext, resource: ResourceDescriptor): boolean {
    return evaluate({ principal, action: WORK_WRITE_ACTION, resource }).effect === 'allow';
  }

  async function guard<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | FastifyReply> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PlanningUnavailableError)
        return reply.code(503).send({ error: error.message });
      if (error instanceof PlanConflictError) return reply.code(409).send({ error: error.code });
      if (error instanceof WorkValidationError) return reply.code(400).send({ error: error.code });
      throw error;
    }
  }

  app.get('/objectives/:id/plan', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    const objective = await readableObjective(principal, id, reply);
    if (objective === null) return reply;
    const plan = await planning.get(principal.organizationId, id);
    return plan ?? reply.code(404).send({ error: 'no_plan' });
  });

  app.post('/objectives/:id/plan', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    const objective = await readableObjective(principal, id, reply);
    if (objective === null) return reply;
    if (!canWrite(principal, orgResource(principal.organizationId))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const today =
      typeof body['today'] === 'string' && ISO_DATE.test(body['today'])
        ? body['today']
        : new Date().toISOString().slice(0, 10);
    return guard(reply, async () => {
      const plan = await planning.start(
        principal.organizationId,
        objective,
        today,
        body['retry'] === true,
      );
      return reply.code(plan.status === 'drafting' ? 202 : 200).send(plan);
    });
  });

  app.post('/objectives/:id/plan/approve', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    const objective = await readableObjective(principal, id, reply);
    if (objective === null) return reply;
    if (!canWrite(principal, orgResource(principal.organizationId))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const raw = body['tasks'];
    if (raw !== undefined && !(Array.isArray(raw) && raw.every((n) => Number.isInteger(n)))) {
      return reply.code(400).send({ error: 'invalid_tasks' });
    }
    return guard(reply, () =>
      planning.approve(
        principal.organizationId,
        objective,
        principal.userId,
        raw as number[] | undefined,
      ),
    );
  });

  app.post('/objectives/:id/plan/dismiss', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    const objective = await readableObjective(principal, id, reply);
    if (objective === null) return reply;
    if (!canWrite(principal, orgResource(principal.organizationId))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return guard(reply, () => planning.dismiss(principal.organizationId, id));
  });

  // Ask Donna to write a task's deliverable.
  app.post('/tasks/:id/draft', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const org = principal.organizationId;
    const { id } = request.params as { id: string };
    const task = await deps.work.getWorkItem(org, id);
    const project = task === null ? null : await deps.work.getProject(org, task.projectId);
    const resource: ResourceDescriptor | null =
      project === null
        ? null
        : {
            organizationId: org,
            scope: project.scope,
            ...(project.scope === 'PROJECT' ? { projectId: project.id } : {}),
          };
    if (
      resource === null ||
      evaluate({ principal, action: WORK_READ_ACTION, resource }).effect !== 'allow'
    ) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!canWrite(principal, resource)) return reply.code(403).send({ error: 'forbidden' });
    return guard(reply, async () => {
      const updated = await planning.startDraft(org, id);
      return updated === null
        ? reply.code(404).send({ error: 'not_found' })
        : reply.code(202).send(updated);
    });
  });
}
