import { describe, expect, it } from 'vitest';

import { InvalidWorkOrderError, parseWorkOrder } from './work-order-payload.js';

describe('parseWorkOrder', () => {
  it('parses a minimal order', () => {
    const order = parseWorkOrder({ organizationId: 'org1', requiredCapabilities: ['crm'] });
    expect(order.organizationId).toBe('org1');
    expect(order.requiredCapabilities).toEqual(['crm']);
  });

  it('defaults requiredCapabilities to an empty array when absent', () => {
    const order = parseWorkOrder({ organizationId: 'org1' });
    expect(order.requiredCapabilities).toEqual([]);
  });

  it('parses optional routing primitives and the model request', () => {
    const order = parseWorkOrder({
      organizationId: 'org1',
      taskId: 'task1',
      requiredCapabilities: ['reasoning'],
      needsReasoning: true,
      reasoningTier: 6,
      needsTools: false,
      modelRequest: { messages: [{ role: 'user', content: 'hi' }], maxOutputTokens: 512 },
    });
    expect(order.taskId).toBe('task1');
    expect(order.needsReasoning).toBe(true);
    expect(order.reasoningTier).toBe(6);
    expect(order.needsTools).toBe(false);
    expect(order.modelRequest?.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(order.modelRequest?.maxOutputTokens).toBe(512);
  });

  it('omits optional fields rather than setting them undefined', () => {
    const order = parseWorkOrder({ organizationId: 'org1', requiredCapabilities: [] });
    expect('taskId' in order).toBe(false);
    expect('modelRequest' in order).toBe(false);
    expect('policy' in order).toBe(false);
    expect('budget' in order).toBe(false);
  });

  it('passes the policy and budget gates through as objects', () => {
    const order = parseWorkOrder({
      organizationId: 'org1',
      requiredCapabilities: [],
      policy: { principal: {}, action: {}, resource: {} },
      budget: { budget: {}, spentUsd: 0 },
    });
    expect(order.policy).toBeDefined();
    expect(order.budget).toBeDefined();
  });

  it.each([
    ['non-object payload', 42],
    ['missing organizationId', { requiredCapabilities: [] }],
    ['empty organizationId', { organizationId: '', requiredCapabilities: [] }],
    ['non-string capability', { organizationId: 'o', requiredCapabilities: [1] }],
    ['non-boolean flag', { organizationId: 'o', needsReasoning: 'yes' }],
    ['model request without messages', { organizationId: 'o', modelRequest: {} }],
    ['model request with empty messages', { organizationId: 'o', modelRequest: { messages: [] } }],
    ['policy that is not an object', { organizationId: 'o', policy: 'nope' }],
  ])('rejects %s', (_label, payload) => {
    expect(() => parseWorkOrder(payload)).toThrow(InvalidWorkOrderError);
  });
});
