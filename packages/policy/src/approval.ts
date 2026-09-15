/**
 * Approval-gate helpers (Technical Plan §6.3, Build Bible doc 06).
 *
 * A material change to an approval's exact scope invalidates it, forcing
 * re-approval. Comparison is structural and key-order-independent.
 */

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRecordView {
  readonly decision: ApprovalDecision;
  readonly exactScope: unknown;
  readonly expiresAt?: Date | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Structural, key-order-independent equality for approval scope objects. */
export function scopesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** True when the scope has materially changed since approval (needs re-approval). */
export function isScopeChangeMaterial(approvedScope: unknown, currentScope: unknown): boolean {
  return !scopesEqual(approvedScope, currentScope);
}

/**
 * Whether a prior approval still authorizes the current action: it must be
 * approved, unexpired, and cover the exact current scope.
 */
export function approvalStillValid(
  approval: ApprovalRecordView,
  currentScope: unknown,
  now: Date = new Date(),
): boolean {
  if (approval.decision !== 'approved') return false;
  if (approval.expiresAt != null && approval.expiresAt.getTime() <= now.getTime()) return false;
  return scopesEqual(approval.exactScope, currentScope);
}
