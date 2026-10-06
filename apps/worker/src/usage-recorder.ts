import type { UsageRecord, UsageRecorder } from '@donna/cost-governor';
import { schema, type DonnaDatabase } from '@donna/db';

/**
 * Postgres-backed usage recorder for AI-0 baseline telemetry.
 *
 * The orchestrator awaits this write before returning the execution result, so
 * a successful model/capability run cannot silently disappear from the
 * economics baseline.
 */
export class DrizzleUsageRecorder implements UsageRecorder {
  constructor(private readonly db: DonnaDatabase) {}

  async record(entry: UsageRecord): Promise<void> {
    if (entry.organizationId === undefined) {
      throw new Error('usage_record_missing_organization');
    }

    await this.db.insert(schema.aiUsageEvents).values({
      organizationId: entry.organizationId,
      modelId: entry.modelId,
      provider: entry.provider,
      inputTokens: entry.inputTokens,
      cachedInputTokens: entry.cachedInputTokens ?? 0,
      outputTokens: entry.outputTokens,
      cacheWriteTokens: entry.cacheWriteTokens ?? 0,
      reasoningTokens: entry.reasoningTokens ?? 0,
      tokenProvenance: entry.tokenProvenance ?? 'UNKNOWN',
      latencyMs: entry.latencyMs,
      retries: entry.retries ?? 0,
      fallbackDepth: entry.fallbackDepth ?? 0,
      actualCostUsd: entry.costUsd.toFixed(8),
      routePolicyVersion: entry.routePolicyVersion ?? 'baseline-v1',
      success: entry.success ?? true,
      ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}),
      ...(entry.objectiveId !== undefined ? { objectiveId: entry.objectiveId } : {}),
      ...(entry.failureClass !== undefined ? { failureClass: entry.failureClass } : {}),
    });
  }
}
