import { evaluate, type PrincipalContext } from '@donna/policy';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { WORK_WRITE_ACTION } from '../actions.js';
import type { Authenticator } from '../auth/authenticate.js';
import type { WorkService } from '../work/types.js';
import { DemoAlreadySeededError, removeDemo, seedDemo } from './seed.js';

export interface DemoRouteDeps {
  readonly work: WorkService;
  readonly authenticate: Authenticator;
}

/** Loading or wiping demo data changes the whole workspace: owners and admins only. */
function canManageDemo(principal: PrincipalContext): boolean {
  if (principal.role !== 'owner' && principal.role !== 'admin') return false;
  return (
    evaluate({
      principal,
      action: WORK_WRITE_ACTION,
      resource: { organizationId: principal.organizationId, scope: 'ORGANIZATION' },
    }).effect === 'allow'
  );
}

/**
 * Demo data for the caller's own organization: `POST /demo` creates the
 * fictional demo client (projects, sprints, tasks, subtasks); `DELETE /demo`
 * removes only rows marked as demo. Tenant-scoped through the principal, so a
 * caller can never seed or wipe another organization.
 */
export function registerDemoRoutes(app: FastifyInstance, deps: DemoRouteDeps): void {
  async function adminOf(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PrincipalContext | null> {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      await reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!canManageDemo(auth.principal)) {
      await reply.code(403).send({ error: 'admin_required' });
      return null;
    }
    return auth.principal;
  }

  app.post('/demo', async (request, reply) => {
    const principal = await adminOf(request, reply);
    if (principal === null) return reply;
    try {
      const counts = await seedDemo(deps.work, principal.organizationId, principal.userId);
      return reply.code(201).send({ seeded: counts });
    } catch (error) {
      if (error instanceof DemoAlreadySeededError) {
        return reply.code(409).send({ error: 'demo_already_seeded' });
      }
      throw error;
    }
  });

  app.delete('/demo', async (request, reply) => {
    const principal = await adminOf(request, reply);
    if (principal === null) return reply;
    const removed = await removeDemo(deps.work, principal.organizationId);
    return { removedClients: removed };
  });
}
