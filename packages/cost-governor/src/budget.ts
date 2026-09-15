/**
 * Budgets (Technical Plan §11, Build Bible V2-012). Enforced at organization,
 * project, user, objective/task and provider/model scopes. Deterministic checks
 * — the Cost Governor calls these before dispatching an AI call.
 */
export type BudgetScope =
  'organization' | 'project' | 'user' | 'objective' | 'task' | 'provider' | 'model';

export interface Budget {
  readonly scope: BudgetScope;
  readonly scopeRef: string;
  readonly limitUsd: number;
}

export interface BudgetCheck {
  readonly allowed: boolean;
  readonly remainingUsd: number;
  readonly reason: 'ok' | 'exceeds_budget';
}

/** Whether an estimated spend fits within a budget given what's already spent. */
export function checkBudget(budget: Budget, spentUsd: number, estimateUsd: number): BudgetCheck {
  const remaining = budget.limitUsd - spentUsd;
  const allowed = estimateUsd <= remaining;
  return {
    allowed,
    remainingUsd: remaining,
    reason: allowed ? 'ok' : 'exceeds_budget',
  };
}
