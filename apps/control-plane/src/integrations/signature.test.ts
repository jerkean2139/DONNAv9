import { describe, expect, it } from 'vitest';

import { signIntegrationBody, verifyIntegrationSignature } from './signature.js';

describe('integration webhook signature', () => {
  const secret = 'test-secret';
  const timestamp = '2026-10-03T20:00:00.000Z';
  const rawBody = '{"event_id":"evt-1"}';

  it('accepts an authentic request inside the replay window', () => {
    const signature = signIntegrationBody(secret, timestamp, rawBody);
    expect(
      verifyIntegrationSignature({
        secret,
        timestamp,
        rawBody,
        signature,
        now: new Date('2026-10-03T20:04:59.000Z'),
      }),
    ).toBe(true);
  });

  it('rejects a modified body', () => {
    const signature = signIntegrationBody(secret, timestamp, rawBody);
    expect(
      verifyIntegrationSignature({
        secret,
        timestamp,
        rawBody: '{"event_id":"tampered"}',
        signature,
        now: new Date('2026-10-03T20:01:00.000Z'),
      }),
    ).toBe(false);
  });

  it('rejects a replay outside the five-minute window', () => {
    const signature = signIntegrationBody(secret, timestamp, rawBody);
    expect(
      verifyIntegrationSignature({
        secret,
        timestamp,
        rawBody,
        signature,
        now: new Date('2026-10-03T20:05:01.000Z'),
      }),
    ).toBe(false);
  });
});
