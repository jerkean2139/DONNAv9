import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, projects, users } from './tenancy.js';
import { objectives, tasks } from './execution.js';

/** How trustworthy a token count is. Never present an estimate as provider-reported. */
export const tokenCountProvenanceEnum = pgEnum('token_count_provenance', [
  'PROVIDER_REPORTED',
  'TOKENIZER_CALCULATED',
  'HEURISTIC_ESTIMATE',
  'HARDCODED_ESTIMATE',
  'UNKNOWN',
]);

/** Data classification used as a hard routing-policy input. */
export const dataClassificationEnum = pgEnum('data_classification', [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);

/**
 * One durable economics record per attempted execution.
 *
 * This table is append-only telemetry. It deliberately records capability work
 * as well as model work so the baseline can compare AI against deterministic
 * execution rather than pretending avoided model calls cost nothing.
 */
export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    objectiveId: uuid('objective_id').references(() => objectives.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    feature: text('feature'),
    taskClass: text('task_class'),
    routePolicyVersion: text('route_policy_version').notNull().default('baseline-v1'),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    cachedInputTokens: bigint('cached_input_tokens', { mode: 'number' }).notNull().default(0),
    cacheWriteTokens: bigint('cache_write_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    reasoningTokens: bigint('reasoning_tokens', { mode: 'number' }).notNull().default(0),
    tokenProvenance: tokenCountProvenanceEnum('token_provenance').notNull().default('UNKNOWN'),
    latencyMs: integer('latency_ms').notNull().default(0),
    retries: integer('retries').notNull().default(0),
    fallbackDepth: integer('fallback_depth').notNull().default(0),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 14, scale: 8 }),
    actualCostUsd: numeric('actual_cost_usd', { precision: 14, scale: 8 }).notNull().default('0'),
    success: boolean('success').notNull().default(true),
    failureClass: text('failure_class'),
    localWorkerId: text('local_worker_id'),
    localGpuSeconds: numeric('local_gpu_seconds', { precision: 14, scale: 4 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ai_usage_events_org_created_idx').on(t.organizationId, t.createdAt),
    index('ai_usage_events_task_idx').on(t.organizationId, t.taskId),
    index('ai_usage_events_model_idx').on(t.organizationId, t.provider, t.modelId),
  ],
);

/** Auditable explanation of each routing decision, independent of model output. */
export const aiRoutingDecisions = pgTable(
  'ai_routing_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    objectiveId: uuid('objective_id').references(() => objectives.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    correlationId: uuid('correlation_id'),
    routePolicyVersion: text('route_policy_version').notNull(),
    taskClass: text('task_class'),
    reasoningTier: integer('reasoning_tier'),
    dataClassification: dataClassificationEnum('data_classification').notNull().default('INTERNAL'),
    candidates: jsonb('candidates').notNull().default([]),
    selectedRoute: text('selected_route').notNull(),
    selectedModelId: text('selected_model_id'),
    reason: text('reason').notNull(),
    expectedCostUsd: numeric('expected_cost_usd', { precision: 14, scale: 8 }),
    expectedQuality: numeric('expected_quality', { precision: 6, scale: 5 }),
    expectedLatencyMs: integer('expected_latency_ms'),
    fallbackDepth: integer('fallback_depth').notNull().default(0),
    outcome: text('outcome'),
    accepted: boolean('accepted'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ai_routing_decisions_org_created_idx').on(t.organizationId, t.createdAt),
    index('ai_routing_decisions_task_idx').on(t.organizationId, t.taskId),
    index('ai_routing_decisions_policy_idx').on(t.organizationId, t.routePolicyVersion),
  ],
);
