import { describe, expect, it } from 'vitest';

import {
  approvalStillValid,
  isScopeChangeMaterial,
  scopesEqual,
  type ApprovalRecordView,
} from './approval.js';

describe('scope comparison', () => {
  it('is key-order independent', () => {
    expect(scopesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('detects material changes', () => {
    expect(isScopeChangeMaterial({ amount: 100 }, { amount: 250 })).toBe(true);
    expect(isScopeChangeMaterial({ amount: 100 }, { amount: 100 })).toBe(false);
  });

  it('compares nested structures', () => {
    expect(scopesEqual({ x: [1, { y: 2 }] }, { x: [1, { y: 2 }] })).toBe(true);
    expect(scopesEqual({ x: [1, { y: 2 }] }, { x: [1, { y: 3 }] })).toBe(false);
  });
});

describe('approvalStillValid', () => {
  const base: ApprovalRecordView = { decision: 'approved', exactScope: { amount: 100 } };

  it('accepts an approved, unexpired, matching-scope approval', () => {
    expect(approvalStillValid(base, { amount: 100 })).toBe(true);
  });

  it('rejects when the scope changed materially', () => {
    expect(approvalStillValid(base, { amount: 999 })).toBe(false);
  });

  it('rejects non-approved decisions', () => {
    for (const decision of ['pending', 'rejected', 'expired'] as const) {
      expect(approvalStillValid({ ...base, decision }, { amount: 100 })).toBe(false);
    }
  });

  it('rejects an expired approval', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(approvalStillValid({ ...base, expiresAt: past }, { amount: 100 })).toBe(false);
  });

  it('accepts when expiry is in the future', () => {
    const future = new Date('2999-01-01T00:00:00Z');
    expect(approvalStillValid({ ...base, expiresAt: future }, { amount: 100 })).toBe(true);
  });
});
