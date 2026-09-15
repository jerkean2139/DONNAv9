import type { ProjectId, RiskLevel, Scope } from '@donna/core-domain';
import { evaluate, type ResourceDescriptor } from '@donna/policy';
import Fastify, { type FastifyInstance } from 'fastify';

import { OBJECTIVE_CREATE_ACTION } from './actions.js';
import { devPrincipalFromHeaders } from './principal.js';
import type { ObjectiveService } from './services/objective-service.js';

export interface ServerDeps {
  readonly objectiveService: ObjectiveService;
}

interface CreateObjectiveBody {
  requestedOutcome?: string;
  definitionOfDone?: string;
  scope?: Scope;
  riskLevel?: RiskLevel;
  projectId?: ProjectId;
  teamId?: string;
}

/**
 * Build the control-plane API (Technical Plan §4.1). Returns the Fastify
 * instance without listening, so tests drive it via `inject`. Every mutating
 * route runs the deterministic policy engine before touching state — the
 * decision is server-side and cannot be bypassed (Build Bible V2-009).
 */
export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/objectives', async (request, reply) => {
    const principal = devPrincipalFromHeaders(request.headers as Record<string, unknown>);
    if (principal === null) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const body = (request.body ?? {}) as CreateObjectiveBody;
    if (typeof body.requestedOutcome !== 'string' || typeof body.definitionOfDone !== 'string') {
      return reply.code(400).send({ error: 'requestedOutcome and definitionOfDone are required' });
    }

    const scope: Scope = body.scope ?? 'ORGANIZATION';
    const resource: ResourceDescriptor = {
      organizationId: principal.organizationId,
      scope,
      ownerUserId: principal.userId,
      ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
    };

    const decision = evaluate({ principal, action: OBJECTIVE_CREATE_ACTION, resource });
    if (decision.effect === 'deny') {
      return reply.code(403).send({ error: decision.reason, message: decision.message });
    }
    if (decision.effect === 'requires_approval') {
      return reply.code(202).send({ status: 'approval_required', reason: decision.reason });
    }

    const objective = await deps.objectiveService.create(
      {
        requestedOutcome: body.requestedOutcome,
        definitionOfDone: body.definitionOfDone,
        scope,
        riskLevel: body.riskLevel ?? 'low',
        ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
      },
      principal,
    );

    return reply.code(201).send(objective);
  });

  app.get('/objectives/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const objective = await deps.objectiveService.get(id);
    if (objective === null) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return objective;
  });

  return app;
}
