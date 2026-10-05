import {
  ATTACHMENT_KINDS,
  CLIENT_STATUSES,
  DRAFT_STATUSES,
  EMAIL_MODES,
  EMAIL_STATUSES,
  EVENT_TYPES,
  EXECUTION_CLASSES,
  OBJECTIVE_STATUSES,
  PLAN_STATUSES,
  RISK_LEVELS,
  ROLES,
  SCOPES,
  SOURCE_CONFIDENCE,
  SPRINT_STATUSES,
  TASK_STATUSES,
  WORK_ITEM_OWNERS,
  WORK_ITEM_STATUSES,
} from '@donna/core-domain';
import { describe, expect, it } from 'vitest';

import {
  attachmentKindEnum,
  clientStatusEnum,
  draftStatusEnum,
  eventTypeEnum,
  executionClassEnum,
  objectiveStatusEnum,
  planStatusEnum,
  emailModeEnum,
  emailStatusEnum,
  riskLevelEnum,
  roleEnum,
  scopeEnum,
  sourceConfidenceEnum,
  sprintStatusEnum,
  taskStatusEnum,
  workItemOwnerEnum,
  workItemStatusEnum,
} from './schema/enums.js';
import {
  aiRoutingDecisions,
  aiUsageEvents,
  approvals,
  auditEvents,
  delegations,
  events,
  featureFlags,
  googleConnections,
  idempotencyKeys,
  memberships,
  outboundEmails,
  objectives,
  organizations,
  projects,
  taskDependencies,
  tasks,
  teams,
  users,
} from './schema/index.js';

/**
 * Drift guard: the Postgres enums must exactly mirror the `@donna/core-domain`
 * string unions. If someone changes a domain enum without updating the schema
 * (or vice versa), these fail — keeping the authoritative store and the domain
 * model in lockstep.
 */
describe('schema enums mirror core-domain', () => {
  it('scope', () => expect(scopeEnum.enumValues).toEqual([...SCOPES]));
  it('role', () => expect(roleEnum.enumValues).toEqual([...ROLES]));
  it('objective status', () =>
    expect(objectiveStatusEnum.enumValues).toEqual([...OBJECTIVE_STATUSES]));
  it('risk level', () => expect(riskLevelEnum.enumValues).toEqual([...RISK_LEVELS]));
  it('task status', () => expect(taskStatusEnum.enumValues).toEqual([...TASK_STATUSES]));
  it('execution class', () =>
    expect(executionClassEnum.enumValues).toEqual([...EXECUTION_CLASSES]));
  it('event type', () => expect(eventTypeEnum.enumValues).toEqual([...EVENT_TYPES]));
  it('source confidence', () =>
    expect(sourceConfidenceEnum.enumValues).toEqual([...SOURCE_CONFIDENCE]));
  it('client status', () => expect(clientStatusEnum.enumValues).toEqual([...CLIENT_STATUSES]));
  it('sprint status', () => expect(sprintStatusEnum.enumValues).toEqual([...SPRINT_STATUSES]));
  it('work item status', () =>
    expect(workItemStatusEnum.enumValues).toEqual([...WORK_ITEM_STATUSES]));
  it('attachment kind', () => expect(attachmentKindEnum.enumValues).toEqual([...ATTACHMENT_KINDS]));
  it('work item owner', () => expect(workItemOwnerEnum.enumValues).toEqual([...WORK_ITEM_OWNERS]));
  it('draft status', () => expect(draftStatusEnum.enumValues).toEqual([...DRAFT_STATUSES]));
  it('plan status', () => expect(planStatusEnum.enumValues).toEqual([...PLAN_STATUSES]));
  it('email mode', () => expect(emailModeEnum.enumValues).toEqual([...EMAIL_MODES]));
  it('email status', () => expect(emailStatusEnum.enumValues).toEqual([...EMAIL_STATUSES]));
});

describe('control-plane tables are defined and org-scoped', () => {
  const orgScoped = [
    users,
    teams,
    memberships,
    projects,
    objectives,
    tasks,
    taskDependencies,
    events,
    approvals,
    delegations,
    auditEvents,
    idempotencyKeys,
    googleConnections,
    outboundEmails,
    aiUsageEvents,
    aiRoutingDecisions,
  ];

  it('every business-state table carries organization_id', () => {
    for (const table of orgScoped) {
      expect(table).toHaveProperty('organizationId');
    }
  });

  it('organizations is the tenancy root', () => {
    expect(organizations).toHaveProperty('id');
    expect(organizations).toHaveProperty('slug');
  });

  it('feature flags may be global (nullable organization_id)', () => {
    expect(featureFlags).toHaveProperty('organizationId');
    expect(featureFlags).toHaveProperty('key');
  });

  it('tasks carry durable-job control columns', () => {
    for (const col of [
      'idempotencyKey',
      'retryCount',
      'maxRetries',
      'leaseOwner',
      'leaseExpiresAt',
      'heartbeatAt',
      'checkpoint',
    ]) {
      expect(tasks).toHaveProperty(col);
    }
  });
});

describe('AI-0 baseline telemetry contracts', () => {
  it('usage events carry economics and token provenance', () => {
    for (const col of [
      'provider',
      'modelId',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'tokenProvenance',
      'actualCostUsd',
      'latencyMs',
      'routePolicyVersion',
    ]) {
      expect(aiUsageEvents).toHaveProperty(col);
    }
  });

  it('routing decisions are tenant-scoped and policy-versioned', () => {
    for (const col of [
      'organizationId',
      'routePolicyVersion',
      'dataClassification',
      'candidates',
      'selectedRoute',
      'reason',
    ]) {
      expect(aiRoutingDecisions).toHaveProperty(col);
    }
  });
});
