import { parseAddressList } from '@donna/adapter-gmail';
import { evaluate, type PrincipalContext, type ResourceDescriptor } from '@donna/policy';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { EMAIL_DRAFT_ACTION, EMAIL_SEND_ACTION, WORK_READ_ACTION } from '../actions.js';
import type { Authenticator } from '../auth/authenticate.js';
import type { WorkService } from '../work/types.js';
import { GmailError, type GmailService } from './gmail-service.js';

export interface EmailRouteDeps {
  readonly gmail: GmailService;
  readonly work: WorkService;
  readonly authenticate: Authenticator;
}

const STATUS: Record<GmailError['code'], number> = {
  gmail_unconfigured: 503,
  gmail_not_connected: 409,
  gmail_reconnect: 409,
  send_in_progress: 409,
  gmail_failed: 502,
  invalid_recipient: 400,
  no_recipient: 400,
  invalid_subject: 400,
  empty_body: 400,
};

function addresses(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value === 'string') return parseAddressList(value);
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  return null;
}

/**
 * Gmail: connect a Google account, and save a task's email to Gmail drafts or
 * send it. Sending is level-3 client-facing comms — the policy engine answers
 * `requires_approval`, and the only approval accepted is the person's own
 * `confirm: true` on the exact message in the same request. The OAuth callback
 * is the one unauthenticated route; its signed, expiring `state` binds it to
 * the user who started the connection.
 */
export function registerEmailRoutes(app: FastifyInstance, deps: EmailRouteDeps): void {
  const { gmail } = deps;

  async function principalOf(request: FastifyRequest, reply: FastifyReply) {
    const auth = await deps.authenticate(request.headers as Record<string, unknown>);
    if (!auth.ok) {
      await reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    return auth.principal;
  }

  /** The task's policy resource if the caller may read it; otherwise replies 404. */
  async function taskResource(
    principal: PrincipalContext,
    id: string,
    reply: FastifyReply,
  ): Promise<ResourceDescriptor | null> {
    const org = principal.organizationId;
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
      await reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return resource;
  }

  app.get('/integrations/google', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    return gmail.status(principal.organizationId, principal.userId);
  });

  app.post('/integrations/google/connect', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    if (!gmail.configured) return reply.code(503).send({ error: 'gmail_unconfigured' });
    return { url: gmail.connectUrl(principal.organizationId, principal.userId) };
  });

  // Google redirects the browser here; answer with a redirect back to the app.
  app.get('/integrations/google/callback', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const result = await gmail.complete(str(query['code']), str(query['state']));
    const target = result.ok ? '/?gmail=connected' : `/?gmail=${encodeURIComponent(result.reason)}`;
    return reply.redirect(target, 303);
  });

  app.delete('/integrations/google', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    await gmail.disconnect(principal.organizationId, principal.userId);
    return reply.code(204).send();
  });

  app.get('/tasks/:id/emails', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    if ((await taskResource(principal, id, reply)) === null) return reply;
    return { emails: await gmail.list(principal.organizationId, id) };
  });

  app.post('/tasks/:id/email', async (request, reply) => {
    const principal = await principalOf(request, reply);
    if (principal === null) return reply;
    const { id } = request.params as { id: string };
    const resource = await taskResource(principal, id, reply);
    if (resource === null) return reply;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const mode = body['mode'];
    if (mode !== 'draft' && mode !== 'send') return reply.code(400).send({ error: 'invalid_mode' });
    const to = addresses(body['to']);
    const cc = addresses(body['cc']);
    if (to === null || cc === null) return reply.code(400).send({ error: 'invalid_recipient' });
    if (typeof body['subject'] !== 'string' || typeof body['body'] !== 'string') {
      return reply.code(400).send({ error: 'invalid_message' });
    }

    const decision = evaluate({
      principal,
      action: mode === 'send' ? EMAIL_SEND_ACTION : EMAIL_DRAFT_ACTION,
      resource,
    });
    if (decision.effect === 'deny') {
      return reply.code(403).send({ error: decision.reason });
    }
    if (decision.effect === 'requires_approval') {
      // Only the person themself can approve their outgoing mail, here and now.
      if (principal.actorKind !== 'human' || body['confirm'] !== true) {
        return reply.code(409).send({ error: 'confirmation_required' });
      }
    }

    try {
      const email = await gmail.deliver(
        principal.organizationId,
        principal.userId,
        id,
        { to, cc, subject: body['subject'], body: body['body'] },
        mode,
      );
      return reply.code(201).send(email);
    } catch (error) {
      if (error instanceof GmailError) {
        return reply.code(STATUS[error.code]).send({ error: error.code });
      }
      throw error;
    }
  });
}
