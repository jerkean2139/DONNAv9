/**
 * Deterministic feature-flag evaluation (Technical Plan §14, Build Bible
 * V2-024). Staged rollout without destructive schema changes. Pure function —
 * the flag records come from the DB `feature_flags` table.
 */

export interface FeatureFlag {
  readonly key: string;
  readonly enabled: boolean;
  readonly rollout?: {
    /** Explicit allow lists win regardless of the global `enabled` bit. */
    readonly allowUserIds?: readonly string[];
    readonly allowOrgIds?: readonly string[];
  };
}

export interface FlagContext {
  readonly userId?: string;
  readonly organizationId?: string;
}

export function isFeatureEnabled(flag: FeatureFlag, ctx: FlagContext = {}): boolean {
  const rollout = flag.rollout;
  if (rollout !== undefined) {
    if (ctx.userId !== undefined && rollout.allowUserIds?.includes(ctx.userId) === true)
      return true;
    if (
      ctx.organizationId !== undefined &&
      rollout.allowOrgIds?.includes(ctx.organizationId) === true
    ) {
      return true;
    }
  }
  return flag.enabled;
}
