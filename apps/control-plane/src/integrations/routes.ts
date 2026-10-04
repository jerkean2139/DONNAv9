import type { FastifyInstance } from 'fastify';

import type { IntegrationInbox, IntegrationSourceConfig } from './inbox.js';
import { parseOperationalEvent } from './inbox.js';
import { verifyIntegrationSignature } from './signature.js';

function header(headers: Record<string, unknown>, name: string): string {
  const value = headers[name];
  return typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : '';
}

export function registerIntegrationRoutes(
  app: FastifyInstance,
  deps: {
    readonly inbox: IntegrationInbox;
    readonly sources: readonly IntegrationSourceConfig[];
  },
): void {
  app.post('/internal/integrations/project-manager/v1/events', async (request, reply) => {
    const headers = request.headers as Record<string, unknown>;
    const sourceKey = header(headers, 'x-donna-source');
    const timestamp = header(headers, 'x-donna-timestamp');
    const signature = header(headers, 'x-donna-signature');
    const sourceConfig = deps.sources.find((source) => source.key === sourceKey);
    if (sourceConfig === undefined) {
      return reply.code(401).send({ error: 'unknown_source' });
    }

    const rawBody = (request as { rawBody?: string }).rawBody ?? '';
    if (
      !verifyIntegrationSignature({
        secret: sourceConfig.secret,
        timestamp,
        rawBody,
        signature,
      })
    ) {
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    const event = parseOperationalEvent(request.body);
    if (event === null) {
      return reply.code(400).send({ error: 'invalid_event' });
    }

    const source = await deps.inbox.resolveSource(sourceKey, event.organizationId);
    if (source === null) {
      return reply.code(403).send({ error: 'organization_not_mapped' });
    }

    const received = await deps.inbox.receive(source.id, source.organizationId, event);
    return reply.code(202).send({ accepted: true, duplicate: received.duplicate });
  });
}
