import { createHmac } from 'node:crypto';

import { schema, type DonnaDatabase } from '@donna/db';
import { and, eq } from 'drizzle-orm';

export const PROJECT_MANAGER_RECONCILIATION_TASK = 'reconcile-project-manager';
const ENTITY_TYPES = ['client', 'project', 'sprint', 'task'] as const;
type ReconciliationEntityType = (typeof ENTITY_TYPES)[number];

export interface ReconciliationSource {
  readonly id: string;
  readonly organizationId: string;
  readonly externalOrganizationId: string;
  readonly key: string;
}

interface ChangePage {
  readonly schema_version: '1';
  readonly organization_id: string;
  readonly entity_type: ReconciliationEntityType;
  readonly items: ReadonlyArray<Record<string, unknown> & { id: number; updatedAt: string }>;
  readonly next_cursor: string;
  readonly has_more: boolean;
}

function signGet(secret: string, timestamp: string, path: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.GET.${path}`).digest('hex')}`;
}

export class ProjectManagerReconciler {
  public constructor(
    private readonly db: DonnaDatabase,
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async runAll(sourceKey = 'kobteamllm'): Promise<number> {
    const sources = await this.db
      .select({
        id: schema.integrationSources.id,
        organizationId: schema.integrationSources.organizationId,
        externalOrganizationId: schema.integrationSources.externalOrganizationId,
        key: schema.integrationSources.key,
      })
      .from(schema.integrationSources)
      .where(eq(schema.integrationSources.key, sourceKey));

    let imported = 0;
    for (const source of sources) imported += await this.runSource(source);
    return imported;
  }

  async runSource(source: ReconciliationSource): Promise<number> {
    let imported = 0;
    for (const entityType of ENTITY_TYPES) imported += await this.runEntity(source, entityType);
    return imported;
  }

  private async runEntity(source: ReconciliationSource, entityType: ReconciliationEntityType): Promise<number> {
    const [stored] = await this.db
      .select({ cursor: schema.integrationReconciliationCursors.cursor })
      .from(schema.integrationReconciliationCursors)
      .where(and(
        eq(schema.integrationReconciliationCursors.organizationId, source.organizationId),
        eq(schema.integrationReconciliationCursors.sourceId, source.id),
        eq(schema.integrationReconciliationCursors.entityType, entityType),
      ))
      .limit(1);

    let cursor = stored?.cursor;
    let imported = 0;
    for (;;) {
      const query = new URLSearchParams({
        organization_id: source.externalOrganizationId,
        entity_type: entityType,
        limit: '100',
      });
      if (cursor) query.set('cursor', cursor);
      const path = `/api/integrations/donna/v1/changes?${query.toString()}`;
      const timestamp = new Date().toISOString();
      const response = await fetch(new URL(path, this.baseUrl), {
        headers: {
          'x-donna-source': source.key,
          'x-donna-timestamp': timestamp,
          'x-donna-signature': signGet(this.secret, timestamp, path),
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`PM reconciliation failed: HTTP ${response.status}`);
      const page = (await response.json()) as ChangePage;
      if (
        page.schema_version !== '1' ||
        page.organization_id !== source.externalOrganizationId ||
        page.entity_type !== entityType ||
        !Array.isArray(page.items) ||
        typeof page.next_cursor !== 'string'
      ) throw new Error('PM reconciliation returned an invalid page');

      for (const item of page.items) {
        const externalId = String(item.id);
        await this.db.insert(schema.integrationIdentityMap).values({
          organizationId: source.organizationId,
          sourceId: source.id,
          entityType,
          externalId,
        }).onConflictDoUpdate({
          target: [
            schema.integrationIdentityMap.organizationId,
            schema.integrationIdentityMap.sourceId,
            schema.integrationIdentityMap.entityType,
            schema.integrationIdentityMap.externalId,
          ],
          set: { updatedAt: new Date() },
        });
        imported += 1;
      }

      cursor = page.next_cursor;
      await this.db.insert(schema.integrationReconciliationCursors).values({
        organizationId: source.organizationId,
        sourceId: source.id,
        entityType,
        cursor,
        reconciledAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [
          schema.integrationReconciliationCursors.organizationId,
          schema.integrationReconciliationCursors.sourceId,
          schema.integrationReconciliationCursors.entityType,
        ],
        set: { cursor, reconciledAt: new Date(), updatedAt: new Date() },
      });

      if (!page.has_more) return imported;
    }
  }
}
