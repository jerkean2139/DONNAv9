import type { ModelMessage, ModelRequest } from '@donna/adapter-base';
import type { WorkOrder } from '@donna/orchestrator';

/** Raised when a job payload cannot be read as a {@link WorkOrder}. */
export class InvalidWorkOrderError extends Error {
  constructor(message: string) {
    super(`Invalid work-order payload: ${message}`);
    this.name = 'InvalidWorkOrderError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') {
    throw new InvalidWorkOrderError(`"${key}" must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidWorkOrderError(`"${key}" must be a string`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new InvalidWorkOrderError(`"${key}" must be a boolean`);
  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidWorkOrderError(`"${key}" must be a finite number`);
  }
  return value;
}

function stringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new InvalidWorkOrderError(`"${key}" must be an array of strings`);
  }
  return value;
}

function parseModelRequest(value: unknown): ModelRequest {
  if (!isRecord(value)) throw new InvalidWorkOrderError('"modelRequest" must be an object');
  const messages = value['messages'];
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new InvalidWorkOrderError('"modelRequest.messages" must be a non-empty array');
  }
  const parsed: ModelMessage[] = messages.map((m, i) => {
    if (!isRecord(m) || typeof m['role'] !== 'string' || typeof m['content'] !== 'string') {
      throw new InvalidWorkOrderError(`"modelRequest.messages[${i}]" must have role and content`);
    }
    return { role: m['role'] as ModelMessage['role'], content: m['content'] };
  });
  const maxOutputTokens = optionalNumber(value, 'maxOutputTokens');
  const reasoningTier = optionalNumber(value, 'reasoningTier');
  return {
    messages: parsed,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(reasoningTier !== undefined ? { reasoningTier } : {}),
  };
}

/**
 * Parse and validate an enqueued job payload into a {@link WorkOrder}. Job
 * payloads are internal (enqueued by the control plane) but arrive as `unknown`
 * from the queue, so this is the worker's trust boundary: the primitive routing
 * fields are validated here; the structured gates (`policy`, `budget`) are
 * shape-checked shallowly and passed through — the deterministic policy engine
 * and cost governor are the authorities on their own contents.
 */
export function parseWorkOrder(payload: unknown): WorkOrder {
  if (!isRecord(payload)) throw new InvalidWorkOrderError('payload must be an object');

  const organizationId = requireString(payload, 'organizationId');
  const requiredCapabilities = stringArray(payload, 'requiredCapabilities');

  const taskId = optionalString(payload, 'taskId');
  const correlationId = optionalString(payload, 'correlationId');
  const prefersHuman = optionalBoolean(payload, 'prefersHuman');
  const needsReasoning = optionalBoolean(payload, 'needsReasoning');
  const reasoningTier = optionalNumber(payload, 'reasoningTier');
  const needsTools = optionalBoolean(payload, 'needsTools');
  const needsVision = optionalBoolean(payload, 'needsVision');
  const requireLocal = optionalBoolean(payload, 'requireLocal');
  const minContextTokens = optionalNumber(payload, 'minContextTokens');

  const modelRequest =
    payload['modelRequest'] !== undefined ? parseModelRequest(payload['modelRequest']) : undefined;

  if (payload['policy'] !== undefined && !isRecord(payload['policy'])) {
    throw new InvalidWorkOrderError('"policy" must be an object');
  }
  if (payload['budget'] !== undefined && !isRecord(payload['budget'])) {
    throw new InvalidWorkOrderError('"budget" must be an object');
  }

  return {
    organizationId,
    requiredCapabilities,
    ...(taskId !== undefined ? { taskId } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(prefersHuman !== undefined ? { prefersHuman } : {}),
    ...(needsReasoning !== undefined ? { needsReasoning } : {}),
    ...(reasoningTier !== undefined ? { reasoningTier } : {}),
    ...(needsTools !== undefined ? { needsTools } : {}),
    ...(needsVision !== undefined ? { needsVision } : {}),
    ...(requireLocal !== undefined ? { requireLocal } : {}),
    ...(minContextTokens !== undefined ? { minContextTokens } : {}),
    ...(modelRequest !== undefined ? { modelRequest } : {}),
    ...(payload['policy'] !== undefined
      ? { policy: payload['policy'] as NonNullable<WorkOrder['policy']> }
      : {}),
    ...(payload['budget'] !== undefined
      ? { budget: payload['budget'] as NonNullable<WorkOrder['budget']> }
      : {}),
  };
}
