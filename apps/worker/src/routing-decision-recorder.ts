import { eq } from 'drizzle-orm';

import type {
  RoutingDecisionOutcome,
  RoutingDecisionRecord,
  RoutingDecisionRecorder,
} from '@donna/orchestrator';
import { schema, type DonnaDatabase } from '@donna/db';

/** Postgres-backed Router Decision Receipt recorder. */
export class DrizzleRoutingDecisionRecorder implements RoutingDecisionRecorder {
  constructor(private readonly db: DonnaDatabase) {}

  async record(entry: RoutingDecisionRecord): Promise<string> {
    const [row] = await this.db
      .insert(schema.aiRoutingDecisions)
      .values({
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
        ...(entry.expectedCostUsd !== undefined
          ? { expectedCostUsd: String(entry.expectedCostUsd) }
          : {}),
        ...(entry.expectedQuality !== undefined
          ? { expectedQuality: String(entry.expectedQuality) }
          : {}),
        ...(entry.expectedLatencyMs !== undefined
          ? { expectedLatencyMs: entry.expectedLatencyMs }
          : {}),
        fallbackDepth: entry.fallbackDepth,
      })
      .returning({ id: schema.aiRoutingDecisions.id });

    if (row === undefined) throw new Error('routing_decision_receipt_not_created');
    return row.id;
  }

  async complete(receiptId: string, outcome: RoutingDecisionOutcome): Promise<void> {
    await this.db
      .update(schema.aiRoutingDecisions)
      .set({
        outcome: outcome.outcome,
        fallbackDepth: outcome.fallbackDepth,
        ...(outcome.selectedModelId !== undefined
          ? { selectedModelId: outcome.selectedModelId }
          : {}),
      })
      .where(eq(schema.aiRoutingDecisions.id, receiptId));
  }
}
