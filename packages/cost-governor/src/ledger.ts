import type { TokenUsage } from './cost.js';

/**
 * UsageLedger and ModelEvaluation (Technical Plan §11). Records actual spend and
 * cost/quality telemetry so the Model Router can learn the empirical cost-quality
 * frontier (Build Bible V2-012). In-memory here; the persistent ledger is backed
 * by the DB `usage_ledger` / `model_evaluation` tables.
 */
export interface UsageRecord extends TokenUsage {
  readonly modelId: string;
  readonly provider: string;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly taskId?: string;
  readonly objectiveId?: string;
}

export class UsageLedger {
  private readonly records: UsageRecord[] = [];

  record(entry: UsageRecord): void {
    this.records.push(entry);
  }

  all(): readonly UsageRecord[] {
    return this.records;
  }

  /** Total spend, optionally filtered (e.g. by model or task). */
  totalUsd(predicate?: (r: UsageRecord) => boolean): number {
    const rows = predicate ? this.records.filter(predicate) : this.records;
    return rows.reduce((sum, r) => sum + r.costUsd, 0);
  }
}

export interface ModelEvaluation {
  readonly taskClass: string;
  readonly modelId: string;
  readonly reasoningTier: number;
  /** 0..1 checker/quality score. */
  readonly qualityScore: number;
  readonly accepted: boolean;
  readonly corrected: boolean;
  readonly costUsd: number;
  readonly latencyMs: number;
}

export interface ModelClassSummary {
  readonly count: number;
  readonly acceptanceRate: number;
  readonly avgCostUsd: number;
  readonly avgQuality: number;
}

/** Aggregate evaluations into an acceptance/cost/quality summary per model. */
export function summarizeByModel(
  evals: readonly ModelEvaluation[],
): Map<string, ModelClassSummary> {
  const groups = new Map<string, ModelEvaluation[]>();
  for (const e of evals) {
    const bucket = groups.get(e.modelId) ?? [];
    bucket.push(e);
    groups.set(e.modelId, bucket);
  }

  const out = new Map<string, ModelClassSummary>();
  for (const [modelId, rows] of groups) {
    const count = rows.length;
    const accepted = rows.filter((r) => r.accepted).length;
    out.set(modelId, {
      count,
      acceptanceRate: accepted / count,
      avgCostUsd: rows.reduce((s, r) => s + r.costUsd, 0) / count,
      avgQuality: rows.reduce((s, r) => s + r.qualityScore, 0) / count,
    });
  }
  return out;
}
