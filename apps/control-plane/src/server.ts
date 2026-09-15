import type { ObjectiveId, ProjectId, RiskLevel, Scope } from '@donna/core-domain';
import type { WorkOrder } from '@donna/orchestrator';
import { evaluate, type ResourceDescriptor } from '@donna/policy';
import Fastify, { type FastifyInstance } from 'fastify';

import { OBJECTIVE_CREATE_ACTION, TASK_DISPATCH_ACTION } from './actions.js';
import type { Authenticator } from './auth/authenticate.js';
import { ClerkPayloadError, parseClerkEvent } from './webhooks/clerk-events.js';
import { WebhookVerificationError, type WebhookVerifier } from './webhooks/clerk-verify.js';
import type { ProvisioningService } from './webhooks/provisioning.js';
import type { ObjectiveService } from './services/objective-service.js';
import type { TaskDispatcher } from './services/task-dispatcher.js';

export interface ServerDeps {
  readonly objectiveService: ObjectiveService;
  /** Atomically creates a task and enqueues its work order (§4.2/§5). */
  readonly taskDispatcher: TaskDispatcher;
  /**
   * Verifies the request and returns the trusted principal, or a refusal. In
   * production a JWT authenticator (provider owns login + MFA); the dev header
   * shim only when no provider is configured (§6/§8).
   */
  readonly authenticate: Authenticator;
  /**
   * Clerk provisioning webhook. When present, `POST /webhooks/clerk` is served,
   * authenticated by the Svix signature (not the JWT authenticator) and applied
   * by the provisioning service. Absent → the route is not registered.
   */
  readonly clerkWebhook?: {
    readonly verifier: WebhookVerifier;
    readonly provisioning: ProvisioningService;
  };
}

function svixHeaders(headers: Record<string, unknown>): Record<string, string> {
  const pick = (key: string): string => {
    const value = headers[key];
    return typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : '';
  };
  return {
    'svix-id': pick('svix-id'),
    'svix-timestamp': pick('svix-timestamp'),
    'svix-signature': pick('svix-signature'),
  };
}

interface CreateObjectiveBody {
  requestedOutcome?: string;
  definitionOfDone?: string;
  scope?: Scope;
  riskLevel?: RiskLevel;
  projectId?: ProjectId;
  teamId?: string;
}

interface DispatchTaskBody {
  goal?: string;
  definitionOfDone?: string;
  requiredCapabilities?: unknown;
  prefersHuman?: boolean;
  needsReasoning?: boolean;
  reasoningTier?: number;
  needsTools?: boolean;
  needsVision?: boolean;
  requireLocal?: boolean;
  minContextTokens?: number;
  modelRequest?: WorkOrder['modelRequest'];
}

function asStringArray(value: unknown): readonly string[] | null {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  return null;
}

/**
 * Build the control-plane API (Technical Plan §4.1). Returns the Fastify
 * instance without listening, so tests drive it via `inject`. Every mutating
 * route runs the deterministic policy engine before touching state — the
 * decision is server-side and cannot be bypassed (Build Bible V2-009).
 */
export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // The Clerk webhook must verify the Svix signature over the RAW body, so keep
  // it alongside the parsed JSON. Only installed when the webhook is configured,
  // so other deployments keep Fastify's default parser untouched.
  if (deps.clerkWebhook !== undefined) {
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      (req as { rawBody?: string }).rawBody = body as string;
      if (body === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    });
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/objectives', async (request, reply) => {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    const principal = auth.principal;

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
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    const principal = auth.principal;
    const { id } = request.params as { id: string };
    // Reads are tenant-scoped: another org's objective reads as not-found.
    const objective = await deps.objectiveService.get(id, principal.organizationId);
    if (objective === null) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return objective;
  });

  // The enqueue path (Technical Plan §4.1/§5): create a durable task under an
  // objective and hand a work order to the durable queue. The worker's
  // `execute-work-order` task then runs it through the orchestrator. The policy
  // gate runs here, server-side, before anything is enqueued.
  app.post('/objectives/:id/tasks', async (request, reply) => {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error });
    }
    const principal = auth.principal;

    const { id } = request.params as { id: string };
    const objective = await deps.objectiveService.get(id, principal.organizationId);
    if (objective === null) {
      return reply.code(404).send({ error: 'objective_not_found' });
    }

    const body = (request.body ?? {}) as DispatchTaskBody;
    if (typeof body.goal !== 'string' || typeof body.definitionOfDone !== 'string') {
      return reply.code(400).send({ error: 'goal and definitionOfDone are required' });
    }
    const requiredCapabilities = asStringArray(body.requiredCapabilities);
    if (requiredCapabilities === null) {
      return reply.code(400).send({ error: 'requiredCapabilities must be an array of strings' });
    }

    // Gate the dispatch against the objective's own scope/ownership so a task
    // under a team- or project-scoped objective inherits that boundary.
    const resource: ResourceDescriptor = {
      organizationId: principal.organizationId,
      scope: objective.scope,
      ownerUserId: objective.ownerId,
      ...(objective.projectId !== undefined ? { projectId: objective.projectId } : {}),
    };
    const decision = evaluate({ principal, action: TASK_DISPATCH_ACTION, resource });
    if (decision.effect === 'deny') {
      return reply.code(403).send({ error: decision.reason, message: decision.message });
    }
    if (decision.effect === 'requires_approval') {
      return reply.code(202).send({ status: 'approval_required', reason: decision.reason });
    }

    // The dispatcher creates the task, writes `task.created`, and enqueues the
    // work order — atomically in the Drizzle path (§4.2/§5).
    const { task, jobId } = await deps.taskDispatcher.dispatch(
      {
        objectiveId: id as ObjectiveId,
        goal: body.goal,
        definitionOfDone: body.definitionOfDone,
        requiredCapabilities,
        ...(body.prefersHuman !== undefined ? { prefersHuman: body.prefersHuman } : {}),
        ...(body.needsReasoning !== undefined ? { needsReasoning: body.needsReasoning } : {}),
        ...(body.reasoningTier !== undefined ? { reasoningTier: body.reasoningTier } : {}),
        ...(body.needsTools !== undefined ? { needsTools: body.needsTools } : {}),
        ...(body.needsVision !== undefined ? { needsVision: body.needsVision } : {}),
        ...(body.requireLocal !== undefined ? { requireLocal: body.requireLocal } : {}),
        ...(body.minContextTokens !== undefined ? { minContextTokens: body.minContextTokens } : {}),
        ...(body.modelRequest !== undefined ? { modelRequest: body.modelRequest } : {}),
      },
      principal,
    );

    return reply.code(202).send({ status: 'queued', task, jobId });
  });

  // Clerk provisioning webhook — authenticated by the Svix signature over the
  // raw body, NOT the JWT authenticator. Verify first (401 on a bad signature),
  // then apply the event (400 on a malformed payload). Unknown event types are a
  // 200 no-op so Clerk does not retry them.
  if (deps.clerkWebhook !== undefined) {
    const { verifier, provisioning } = deps.clerkWebhook;
    app.post('/webhooks/clerk', async (request, reply) => {
      const rawBody = (request as { rawBody?: string }).rawBody ?? '';
      let verified: unknown;
      try {
        verified = verifier.verify(
          rawBody,
          svixHeaders(request.headers as Record<string, unknown>),
        );
      } catch (error) {
        if (error instanceof WebhookVerificationError) {
          return reply.code(401).send({ error: 'invalid_signature' });
        }
        throw error;
      }
      try {
        const { handled } = await provisioning.handle(parseClerkEvent(verified));
        return reply.code(200).send({ handled });
      } catch (error) {
        if (error instanceof ClerkPayloadError) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    });
  }

  return app;
}
