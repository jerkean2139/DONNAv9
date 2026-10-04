import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export function signIntegrationBody(secret: string, timestamp: string, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifyIntegrationSignature(input: {
  readonly secret: string;
  readonly timestamp: string;
  readonly rawBody: string;
  readonly signature: string;
  readonly now?: Date;
  readonly maxAgeSeconds?: number;
}): boolean {
  const maxAgeSeconds = input.maxAgeSeconds ?? 300;
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) return false;

  const nowMs = (input.now ?? new Date()).getTime();
  if (Math.abs(nowMs - timestampMs) > maxAgeSeconds * 1000) return false;

  const expected = signIntegrationBody(input.secret, input.timestamp, input.rawBody);
  const actual = input.signature;
  if (!actual.startsWith(SIGNATURE_PREFIX)) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
