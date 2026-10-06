import type { RoutingDecisionRecord, RoutingDecisionRecorder } from '@donna/orchestrator';
import { schema, type DonnaDatabase } from '@donna/db';

/** Postgres-backed Router Decision Receipt recorder. */
export class DrizzleRoutingDecisionRecorder implements RoutingDecisionRecorder {
  constructor(private readonly db: DonnaDatabase) {}

  async record(entry: RoutingDecisionRecord): Promise<void> {
    await this.db.insert(schema.aiRoutingDecisions).values({
      organizationId: entry.organizationId,
      ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}),
      ...(entry.correlationId !== undefined ? { correlationId: entry.correlationId } : {}),
      routePolicyVersion: entry.routePolicyVersion,
      reasoningTier: entry.reasoningTier,
      dataClassification: entry.dataClassification,
      candidates: entry.candidates,
      selectedRoute: entry.selectedRoute,
      ...(entry.selectedModelId !== undefined ? { selectedModelId: entry.selectedModelId } : {}),
      reason: entry.reason,
      fallbackDepth: entry.fallbackDepth,
    });
  }
}
